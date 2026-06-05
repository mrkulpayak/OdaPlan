import { SNAP_DISTANCE_CM } from '../lib/constants';
import { distancePointToSegment, closestPointOnSegment } from '../lib/geometry';
import type { Room, FurnitureInstance, FurnitureCatalogItem, FurnitureFrontSide } from '../types';

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

  // ── Priority 2: wall snap (translate + rotate flush) ─────────────────────
  //
  // Algorithm:
  //   For each wall × each face:
  //   1. Measure distance from the CURRENT-rotation face midpoint to the wall.
  //      (This is the trigger: "how close is this face to this wall right now?")
  //   2. If within snap distance and best so far:
  //      a. Compute the exact rotation needed for this face to be flush.
  //      b. Re-compute the face midpoint at the NEW rotation.
  //      c. Find the nearest point on the wall to the new midpoint.
  //      d. Offset the furniture so the new midpoint lands on the wall point.
  //
  // Result: the face that was approaching the wall gets rotated flush, then
  // positioned so it's exactly on the wall.
  const mids = rotatedSideMidpoints(pos, w, d, currentRotation);
  const sideEntries = Object.entries(mids) as Array<[FurnitureFrontSide, { x: number; y: number }]>;

  for (const wall of room.walls) {
    const a = room.points[wall.startPointIndex];
    const b = room.points[wall.endPointIndex];
    const wallLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (wallLen < 1) continue;

    const ux = (b.x - a.x) / wallLen;
    const uy = (b.y - a.y) / wallLen;
    const nx = -uy; // inward normal
    const ny =  ux;

    const reqRot = flushRotations(nx, ny);

    for (const [side, midpoint] of sideEntries) {
      const dist = distancePointToSegment(midpoint, a, b);
      if (dist >= bestDist || dist > SNAP_DISTANCE_CM) continue;

      // New rotation that makes this face flush with the wall
      const newRotation = reqRot[side];

      // Face midpoint at the new rotation
      const newMids = rotatedSideMidpoints(pos, w, d, newRotation);
      const newMid  = newMids[side];

      // Nearest point on wall to the (new-rotation) face midpoint
      const wallPt = closestPointOnSegment(newMid, a, b);

      // Face midpoint offset from furniture visual center at new rotation
      const cx = pos.x + w / 2;
      const cy = pos.y + d / 2;
      const rdx = newMid.x - cx;
      const rdy = newMid.y - cy;

      // Move center so the face midpoint lands exactly on wallPt
      const newCenter  = { x: wallPt.x - rdx, y: wallPt.y - rdy };
      const snappedPos = { x: newCenter.x - w / 2, y: newCenter.y - d / 2 };

      bestDist  = dist;
      bestResult = {
        position:  snappedPos,
        rotation:  newRotation,
        snappedTo: { wallId: wall.id, side },
        guideLines: [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }],
      };
    }
  }
  if (bestResult && bestDist <= SNAP_DISTANCE_CM) return bestResult;

  // ── Priority 3: furniture-to-furniture snap ───────────────────────────────
  for (const other of otherInstances) {
    const otherItem = otherItems.get(other.catalogItemId);
    if (!otherItem) continue;
    const ow = otherItem.widthCm;
    const od = otherItem.depthCm;
    const op = other.position;

    const checks: Array<[number, number, number, number, { x: number; y: number }]> = [
      [pos.x + w,   pos.y + d / 2, op.x,        op.y + od / 2, { x: op.x - w,  y: pos.y }],
      [pos.x,       pos.y + d / 2, op.x + ow,   op.y + od / 2, { x: op.x + ow, y: pos.y }],
      [pos.x + w/2, pos.y + d,     op.x + ow/2, op.y,          { x: pos.x,     y: op.y - d }],
      [pos.x + w/2, pos.y,         op.x + ow/2, op.y + od,     { x: pos.x,     y: op.y + od }],
    ];

    for (const [mx, my, ox, oy, snappedPos] of checks) {
      const dist = Math.hypot(mx - ox, my - oy);
      if (dist < SNAP_DISTANCE_CM && dist < bestDist) {
        bestDist   = dist;
        bestResult = { position: snappedPos, rotation: currentRotation, guideLines: [] };
      }
    }
  }
  if (bestResult && bestDist <= SNAP_DISTANCE_CM) return bestResult;

  // No snap — preserve current position and rotation
  return { position: pos, rotation: currentRotation, guideLines: [] };
}
