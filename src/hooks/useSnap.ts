import { SNAP_DISTANCE_CM } from '../lib/constants';
import { distancePointToSegment, closestPointOnSegment } from '../lib/geometry';
import type { Room, FurnitureInstance, FurnitureCatalogItem, FurnitureFrontSide, Column } from '../types';

export interface SnapResult {
  position: { x: number; y: number };
  rotation: number;
  snappedTo?: { wallId: string; side: FurnitureFrontSide };
  guideLines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

/**
 * Compute side midpoints of a furniture rectangle at the given rotation.
 * SVG rotation rotates around the visual center (pos.x + w/2, pos.y + d/2).
 */
function rotatedSideMidpoints(
  pos: { x: number; y: number },
  w: number,
  d: number,
  rotDeg: number
): Record<FurnitureFrontSide, { x: number; y: number }> {
  const cx = pos.x + w / 2;
  const cy = pos.y + d / 2;
  const r  = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const rot = (dx: number, dy: number) => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  });
  return {
    top:    rot(0,      -d / 2),
    bottom: rot(0,       d / 2),
    left:   rot(-w / 2,  0),
    right:  rot( w / 2,  0),
  };
}

/**
 * Compute the 4 corners of a furniture rectangle at the given rotation.
 */
function rotatedCorners(
  pos: { x: number; y: number },
  w: number,
  d: number,
  rotDeg: number
) {
  const cx = pos.x + w / 2;
  const cy = pos.y + d / 2;
  const r  = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const rot = (dx: number, dy: number) => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  });
  return [
    rot(-w / 2, -d / 2),
    rot( w / 2, -d / 2),
    rot( w / 2,  d / 2),
    rot(-w / 2,  d / 2),
  ];
}

/**
 * For a wall with inward normal (nx, ny), compute the exact rotation (degrees) needed
 * for each face of the furniture to become flush against that wall.
 *
 * The face must face OUTWARD from the furniture toward the wall, so its world-space
 * normal must equal (-nx, -ny).
 *
 * SVG rotate(θ) maps a vector (dx, dy) → (dx cosθ − dy sinθ, dx sinθ + dy cosθ).
 *
 *  Face 'top'    unrotated normal (0,−1) → rotated (sinθ, −cosθ) = (−nx, −ny)
 *                → sinθ = −nx, cosθ = ny  → θ = atan2(−nx, ny)
 *  Face 'bottom' unrotated normal (0, 1) → rotated (−sinθ, cosθ) = (−nx, −ny)
 *                → sinθ = nx, cosθ = −ny  → θ = atan2(nx, −ny)
 *  Face 'left'   unrotated normal (−1,0) → rotated (−cosθ,−sinθ) = (−nx, −ny)
 *                → cosθ = nx, sinθ = ny   → θ = atan2(ny, nx)
 *  Face 'right'  unrotated normal (1, 0) → rotated (cosθ, sinθ) = (−nx, −ny)
 *                → cosθ = −nx, sinθ = −ny → θ = atan2(−ny, −nx)
 */
function flushRotations(nx: number, ny: number): Record<FurnitureFrontSide, number> {
  const deg = (rad: number) => ((rad * 180) / Math.PI + 360) % 360;
  return {
    top:    deg(Math.atan2(-nx,  ny)),
    bottom: deg(Math.atan2( nx, -ny)),
    left:   deg(Math.atan2( ny,  nx)),
    right:  deg(Math.atan2(-ny, -nx)),
  };
}

/**
 * Generate the 4 outer face segments of a (possibly rotated) column.
 * Each face is oriented so its computed normal (nx=-uy, ny=ux) points OUTWARD
 * from the column center — matching the convention expected by flushRotations.
 */
function columnFaceSegments(col: Column): Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> {
  const cx = col.position.x + col.widthCm / 2;
  const cy = col.position.y + col.depthCm / 2;
  const hw = col.widthCm / 2;
  const hd = col.depthCm / 2;
  const θ = (col.rotation * Math.PI) / 180;
  const cos = Math.cos(θ);
  const sin = Math.sin(θ);
  const rot = (dx: number, dy: number) => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  });
  // Corners
  const tl = rot(-hw, -hd);
  const tr = rot( hw, -hd);
  const br = rot( hw,  hd);
  const bl = rot(-hw,  hd);
  // Face segments ordered so normal (nx=-uy, ny=ux) points OUTWARD:
  // Top: tr→tl  → ux=-1,uy=0 → nx=0,ny=-1 (upward) ✓
  // Right: br→tr → ux=0,uy=-1 → nx=1,ny=0 (rightward) ✓
  // Bottom: bl→br → ux=1,uy=0 → nx=0,ny=1 (downward) ✓
  // Left: tl→bl → ux=0,uy=1 → nx=-1,ny=0 (leftward) ✓
  return [
    { a: tr, b: tl },
    { a: br, b: tr },
    { a: bl, b: br },
    { a: tl, b: bl },
  ];
}

/**
 * Main snap computation.
 *
 * Priority 1 — corner snap  : rotated furniture corner → room corner (translate only, no rotation change)
 * Priority 2 — wall snap    : closest rotated face → wall, AND rotate face flush with wall
 * Priority 3 — furniture→furniture snap
 *
 * @param currentRotation  The furniture's current rotation in degrees (preserved when not snapping;
 *                         adjusted to align with wall when snapping).
 */
export function computeSnap(
  pos: { x: number; y: number },
  item: FurnitureCatalogItem,
  room: Room | null,
  otherInstances: FurnitureInstance[],
  otherItems: Map<string, FurnitureCatalogItem>,
  currentRotation = 0
): SnapResult {
  if (!room) return { position: pos, rotation: currentRotation, guideLines: [] };

  const w = item.widthCm;
  const d = item.depthCm;

  let bestDist = SNAP_DISTANCE_CM + 1;
  let bestResult: SnapResult | null = null;

  // ── Priority 1: corner snap (translate only) ─────────────────────────────
  const furCorners = rotatedCorners(pos, w, d, currentRotation);
  for (const roomCorner of room.points) {
    for (const fc of furCorners) {
      const dist = Math.hypot(fc.x - roomCorner.x, fc.y - roomCorner.y);
      if (dist < SNAP_DISTANCE_CM && dist < bestDist) {
        bestDist = dist;
        bestResult = {
          position: {
            x: pos.x + (roomCorner.x - fc.x),
            y: pos.y + (roomCorner.y - fc.y),
          },
          rotation: currentRotation, // corner snap doesn't change rotation
          guideLines: [],
        };
      }
    }
  }
  if (bestResult && bestDist <= SNAP_DISTANCE_CM) return bestResult;

  // ── Priority 2: furniture-to-furniture snap ───────────────────────────────
  //
  // This runs BEFORE wall snap so that wall-snapped furniture can still snap
  // to adjacent wall-snapped furniture. If wall snap ran first, its 0cm distance
  // would always beat furniture snap, making it impossible to align two items
  // that are both against walls.
  //
  // Uses axis-aligned bounding boxes — works correctly when rotation=0 or 90°.
  // Threshold: SNAP_DISTANCE_CM / 2 (5cm) — shorter than wall snap (10cm).
  // If furniture snap fires, return immediately (before wall snap).
  const FURN_SNAP = SNAP_DISTANCE_CM / 2;
  for (const other of otherInstances) {
    const otherItem = otherItems.get(other.catalogItemId);
    if (!otherItem) continue;
    const ow = otherItem.widthCm;
    const od = otherItem.depthCm;
    const op = other.position;

    // Horizontal snaps: check perpendicular (x) gap and vertical (y) overlap
    const yOverlap = Math.min(pos.y + d, op.y + od) - Math.max(pos.y, op.y);
    if (yOverlap > -FURN_SNAP) {
      // Right of dragged → Left of other
      const gapR = Math.abs((pos.x + w) - op.x);
      if (gapR < FURN_SNAP && gapR < bestDist) {
        bestDist   = gapR;
        bestResult = { position: { x: op.x - w, y: pos.y }, rotation: currentRotation, guideLines: [] };
      }
      // Left of dragged → Right of other
      const gapL = Math.abs(pos.x - (op.x + ow));
      if (gapL < FURN_SNAP && gapL < bestDist) {
        bestDist   = gapL;
        bestResult = { position: { x: op.x + ow, y: pos.y }, rotation: currentRotation, guideLines: [] };
      }
    }

    // Vertical snaps: check perpendicular (y) gap and horizontal (x) overlap
    const xOverlap = Math.min(pos.x + w, op.x + ow) - Math.max(pos.x, op.x);
    if (xOverlap > -FURN_SNAP) {
      // Bottom of dragged → Top of other
      const gapB = Math.abs((pos.y + d) - op.y);
      if (gapB < FURN_SNAP && gapB < bestDist) {
        bestDist   = gapB;
        bestResult = { position: { x: pos.x, y: op.y - d }, rotation: currentRotation, guideLines: [] };
      }
      // Top of dragged → Bottom of other
      const gapT = Math.abs(pos.y - (op.y + od));
      if (gapT < FURN_SNAP && gapT < bestDist) {
        bestDist   = gapT;
        bestResult = { position: { x: pos.x, y: op.y + od }, rotation: currentRotation, guideLines: [] };
      }
    }
  }
  // If furniture snap found a result, return early (beats wall snap)
  if (bestResult && bestDist <= FURN_SNAP) return bestResult;

  // ── Priority 3: wall/column snap (translate + rotate flush) ──────────────
  //
  // Runs only if no furniture snap fired. Threshold: SNAP_DISTANCE_CM (10cm).
  //
  // For each snap segment (room wall or column face) × each furniture face:
  //   1. Measure distance from the CURRENT-rotation face midpoint to the segment.
  //   2. If within snap distance, compute flush rotation and snap position.
  const mids = rotatedSideMidpoints(pos, w, d, currentRotation);
  const sideEntries = Object.entries(mids) as Array<[FurnitureFrontSide, { x: number; y: number }]>;

  type SnapSeg = { a: { x: number; y: number }; b: { x: number; y: number }; wallId?: string };
  const snapSegs: SnapSeg[] = [
    ...room.walls.map((wall) => ({
      a: room.points[wall.startPointIndex],
      b: room.points[wall.endPointIndex],
      wallId: wall.id,
    })),
    ...(room.columns ?? []).flatMap((col) =>
      columnFaceSegments(col).map((seg) => ({ ...seg, wallId: undefined }))
    ),
  ];

  // Reset bestDist so wall snap uses its own threshold independently
  let wallBestDist = SNAP_DISTANCE_CM + 1;
  let wallBestResult: SnapResult | null = null;

  for (const seg of snapSegs) {
    const { a, b } = seg;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 1) continue;

    const ux = (b.x - a.x) / segLen;
    const uy = (b.y - a.y) / segLen;
    const nx = -uy;
    const ny =  ux;

    const reqRot = flushRotations(nx, ny);

    for (const [side, midpoint] of sideEntries) {
      const dist = distancePointToSegment(midpoint, a, b);
      if (dist >= wallBestDist || dist > SNAP_DISTANCE_CM) continue;

      const newRotation = reqRot[side];
      const newMids = rotatedSideMidpoints(pos, w, d, newRotation);
      const newMid  = newMids[side];
      const wallPt  = closestPointOnSegment(newMid, a, b);

      const cx = pos.x + w / 2;
      const cy = pos.y + d / 2;
      const rdx = newMid.x - cx;
      const rdy = newMid.y - cy;

      const newCenter  = { x: wallPt.x - rdx, y: wallPt.y - rdy };
      const snappedPos = { x: newCenter.x - w / 2, y: newCenter.y - d / 2 };

      wallBestDist  = dist;
      wallBestResult = {
        position:  snappedPos,
        rotation:  newRotation,
        snappedTo: seg.wallId ? { wallId: seg.wallId, side } : undefined,
        guideLines: [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }],
      };
    }
  }
  if (wallBestResult && wallBestDist <= SNAP_DISTANCE_CM) return wallBestResult;

  // No snap — preserve current position and rotation
  return { position: pos, rotation: currentRotation, guideLines: [] };
}
