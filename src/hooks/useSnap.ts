import { SNAP_DISTANCE_CM } from '../lib/constants';
import { distancePointToSegment, closestPointOnSegment } from '../lib/geometry';
import type { Room, FurnitureInstance, FurnitureCatalogItem, FurnitureFrontSide, Column, CustomShapeInstance } from '../types';
import { shapeBBox } from '../lib/customShapes';

/**
 * Convert custom shape instances into fake FurnitureInstance + catalog item entries
 * so they participate in furniture-to-furniture snap just like regular furniture.
 * Optionally pass `excludeId` to skip the dragged custom shape itself.
 */
export function customShapesAsFakeInstances(
  customShapes: CustomShapeInstance[],
  excludeId?: string,
): { instances: FurnitureInstance[]; itemMap: Map<string, FurnitureCatalogItem> } {
  const instances: FurnitureInstance[] = [];
  const itemMap = new Map<string, FurnitureCatalogItem>();
  for (const cs of customShapes) {
    if (cs.id === excludeId) continue;
    const fakeId = `__cs_${cs.id}`;
    const bbox = shapeBBox(cs.dims);
    const fakeItem: FurnitureCatalogItem = {
      id: fakeId, dealerId: null, companyId: '', modelId: null,
      name: cs.name ?? 'Özel Şekil',
      category: 'Özel',
      shapeType: 'rectangle',
      frontSide: 'bottom',
      widthCm: bbox.w, depthCm: bbox.h,
      params: null, isGlobal: false,
    };
    instances.push({ id: fakeId, catalogItemId: fakeId, position: cs.position, rotation: cs.rotation });
    itemMap.set(fakeId, fakeItem);
  }
  return { instances, itemMap };
}

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
 * Axis-aligned bounding box (AABB) for a possibly-rotated rectangle.
 * Returns { x, y, w, d } of the axis-aligned envelope.
 */
function rotatedAABB(
  pos: { x: number; y: number }, w: number, d: number, rotDeg: number
): { x: number; y: number; w: number; d: number } {
  const cx = pos.x + w / 2, cy = pos.y + d / 2;
  const r  = (rotDeg * Math.PI) / 180;
  const ac = Math.abs(Math.cos(r));
  const as = Math.abs(Math.sin(r));
  const hw = (w * ac + d * as) / 2;
  const hd = (w * as + d * ac) / 2;
  return { x: cx - hw, y: cy - hd, w: hw * 2, d: hd * 2 };
}

/**
 * Main snap computation.
 *
 * Priority 1 — corner snap         : rotated furniture corner → room corner
 * Priority 2 — wall/column snap    : closest face → wall, rotate flush
 * Priority 3 — furniture snap      : if wall snap active → along-wall only;
 *                                    if no wall snap → free axis-aligned snap
 *
 * When a piece is already wall-snapped, furniture-to-furniture snap is applied
 * only in the along-wall direction so the piece stays flush with the wall.
 *
 * @param currentRotation  Current rotation in degrees.
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
          rotation: currentRotation,
          guideLines: [],
        };
      }
    }
  }
  if (bestResult && bestDist <= SNAP_DISTANCE_CM) return bestResult;

  // ── Priority 2: wall/column snap (translate + rotate flush) ──────────────
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

  let wallBestDist = SNAP_DISTANCE_CM + 1;
  let wallBestResult: SnapResult | null = null;
  // Along-wall unit vector of the best wall segment (used for constrained furniture snap)
  let wallUx = 1, wallUy = 0;

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
      if (seg.wallId) { wallUx = ux; wallUy = uy; }
    }
  }

  // ── Priority 3: furniture-to-furniture snap ───────────────────────────────
  const FURN_SNAP = SNAP_DISTANCE_CM / 2;
  const wallActive = wallBestResult !== null && wallBestDist <= SNAP_DISTANCE_CM;

  if (wallActive) {
    // Wall-constrained furniture snap.
    //
    // We project all piece corners onto the wall direction to get accurate
    // along-wall extents — this works correctly for any wall angle and any
    // furniture rotation, unlike the AABB approach which breaks for angled walls.
    const snappedPos = wallBestResult!.position;
    const snappedRot = wallBestResult!.rotation;

    const snapResult = furnitureSnapAlongWall(
      snappedPos, w, d, snappedRot,
      otherInstances, otherItems,
      wallUx, wallUy,
      FURN_SNAP,
    );

    if (snapResult !== null) {
      return {
        ...wallBestResult!,
        position: {
          x: snappedPos.x + snapResult * wallUx,
          y: snappedPos.y + snapResult * wallUy,
        },
      };
    }

    return wallBestResult!;
  }

  // No wall snap: free axis-aligned furniture snap using AABBs.
  const myAABB = rotatedAABB(pos, w, d, currentRotation);
  const myCx   = pos.x + w / 2;
  const myCy   = pos.y + d / 2;

  let furnBestDist = FURN_SNAP + 1;
  let furnBestPos: { x: number; y: number } | null = null;

  for (const other of otherInstances) {
    const otherItem = otherItems.get(other.catalogItemId);
    if (!otherItem) continue;
    const ow = otherItem.widthCm;
    const od = otherItem.depthCm;
    const otherRot  = other.rotation ?? 0;
    const otherAABB = rotatedAABB(other.position, ow, od, otherRot);

    const yOverlap = Math.min(myAABB.y + myAABB.d, otherAABB.y + otherAABB.d)
                   - Math.max(myAABB.y,              otherAABB.y);
    if (yOverlap > -FURN_SNAP) {
      const gapR = Math.abs((myAABB.x + myAABB.w) - otherAABB.x);
      if (gapR < FURN_SNAP && gapR < furnBestDist) {
        furnBestDist = gapR;
        furnBestPos  = { x: (otherAABB.x - myAABB.w / 2) - w / 2, y: myCy - d / 2 };
      }
      const gapL = Math.abs(myAABB.x - (otherAABB.x + otherAABB.w));
      if (gapL < FURN_SNAP && gapL < furnBestDist) {
        furnBestDist = gapL;
        furnBestPos  = { x: (otherAABB.x + otherAABB.w + myAABB.w / 2) - w / 2, y: myCy - d / 2 };
      }
    }

    const xOverlap = Math.min(myAABB.x + myAABB.w, otherAABB.x + otherAABB.w)
                   - Math.max(myAABB.x,              otherAABB.x);
    if (xOverlap > -FURN_SNAP) {
      const gapB = Math.abs((myAABB.y + myAABB.d) - otherAABB.y);
      if (gapB < FURN_SNAP && gapB < furnBestDist) {
        furnBestDist = gapB;
        furnBestPos  = { x: myCx - w / 2, y: (otherAABB.y - myAABB.d / 2) - d / 2 };
      }
      const gapT = Math.abs(myAABB.y - (otherAABB.y + otherAABB.d));
      if (gapT < FURN_SNAP && gapT < furnBestDist) {
        furnBestDist = gapT;
        furnBestPos  = { x: myCx - w / 2, y: (otherAABB.y + otherAABB.d + myAABB.d / 2) - d / 2 };
      }
    }
  }

  if (furnBestPos && furnBestDist <= FURN_SNAP) {
    return { position: furnBestPos, rotation: currentRotation, guideLines: [] };
  }

  // No snap — preserve current position and rotation
  return { position: pos, rotation: currentRotation, guideLines: [] };
}

/**
 * Collect along-wall edge positions (cm from wall start) for all doors, windows,
 * and wall-touching columns on a given wall. Used for door/window/column mutual snap.
 */
export function collectWallItemEdges(
  wallId: string,
  wallAx: number, wallAy: number,
  wallBx: number, wallBy: number,
  excludeId: string | null,
  room: Room,
): number[] {
  const wallLen = Math.hypot(wallBx - wallAx, wallBy - wallAy);
  if (wallLen < 1) return [];
  const ux = (wallBx - wallAx) / wallLen;
  const uy = (wallBy - wallAy) / wallLen;

  const edges: number[] = [];

  for (const d of room.doors) {
    if (d.id === excludeId || d.wallId !== wallId) continue;
    const ct = d.positionOnWall * wallLen;
    edges.push(ct - d.widthCm / 2, ct + d.widthCm / 2);
  }
  for (const w of room.windows) {
    if (w.id === excludeId || w.wallId !== wallId) continue;
    const ct = w.positionOnWall * wallLen;
    edges.push(ct - w.widthCm / 2, ct + w.widthCm / 2);
  }
  for (const col of room.columns ?? []) {
    if (col.id === excludeId) continue;
    const cx = col.position.x + col.widthCm / 2;
    const cy = col.position.y + col.depthCm / 2;
    const θ = (col.rotation * Math.PI) / 180;
    const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
    const hw = col.widthCm / 2, hd = col.depthCm / 2;
    const corners = [
      { lx: -hw, ly: -hd }, { lx: hw, ly: -hd },
      { lx:  hw, ly:  hd }, { lx: -hw, ly:  hd },
    ].map(({ lx, ly }) => ({
      x: cx + lx * cosθ - ly * sinθ,
      y: cy + lx * sinθ + ly * cosθ,
    }));
    const minPerp = Math.min(...corners.map(c => {
      const dx = c.x - wallAx, dy = c.y - wallAy;
      return Math.abs(dx * (-uy) + dy * ux);
    }));
    if (minPerp > 2) continue;
    const ts = corners.map(c => (c.x - wallAx) * ux + (c.y - wallAy) * uy);
    edges.push(Math.min(...ts), Math.max(...ts));
  }

  return edges;
}

/**
 * Collect along-wall ranges [start, end] (cm from wall start) for ALL items
 * on a wall (doors, windows, columns), excluding the item with excludeId.
 * Used for overlap prevention when dragging a door/window.
 */
export function collectWallObstacleRanges(
  wallId: string,
  wallAx: number, wallAy: number,
  wallBx: number, wallBy: number,
  excludeId: string,
  room: Room,
): Array<[number, number]> {
  const wallLen = Math.hypot(wallBx - wallAx, wallBy - wallAy);
  if (wallLen < 1) return [];
  const ux = (wallBx - wallAx) / wallLen;
  const uy = (wallBy - wallAy) / wallLen;
  const ranges: Array<[number, number]> = [];

  for (const d of room.doors) {
    if (d.id === excludeId || d.wallId !== wallId) continue;
    const ct = d.positionOnWall * wallLen;
    ranges.push([ct - d.widthCm / 2, ct + d.widthCm / 2]);
  }
  for (const w of room.windows) {
    if (w.id === excludeId || w.wallId !== wallId) continue;
    const ct = w.positionOnWall * wallLen;
    ranges.push([ct - w.widthCm / 2, ct + w.widthCm / 2]);
  }
  // Columns via physical proximity
  for (const col of room.columns ?? []) {
    if (col.id === excludeId) continue;
    const cx = col.position.x + col.widthCm / 2;
    const cy = col.position.y + col.depthCm / 2;
    const θ = (col.rotation * Math.PI) / 180;
    const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
    const hw = col.widthCm / 2, hd = col.depthCm / 2;
    const corners = [
      { lx: -hw, ly: -hd }, { lx: hw, ly: -hd },
      { lx:  hw, ly:  hd }, { lx: -hw, ly:  hd },
    ].map(({ lx, ly }) => ({
      x: cx + lx * cosθ - ly * sinθ,
      y: cy + lx * sinθ + ly * cosθ,
    }));
    const minPerp = Math.min(...corners.map(c => {
      const dx = c.x - wallAx, dy = c.y - wallAy;
      return Math.abs(dx * (-uy) + dy * ux);
    }));
    if (minPerp > 2) continue;
    const ts = corners.map(c => (c.x - wallAx) * ux + (c.y - wallAy) * uy);
    ranges.push([Math.min(...ts), Math.max(...ts)]);
  }
  return ranges;
}

/**
 * Collect along-wall ranges [start, end] (cm from wall start) occupied by
 * columns that physically touch the given wall. Used for overlap prevention.
 */
export function collectColumnWallRanges(
  wallAx: number, wallAy: number,
  wallBx: number, wallBy: number,
  room: Room,
): Array<[number, number]> {
  const wallLen = Math.hypot(wallBx - wallAx, wallBy - wallAy);
  if (wallLen < 1) return [];
  const ux = (wallBx - wallAx) / wallLen;
  const uy = (wallBy - wallAy) / wallLen;
  const ranges: Array<[number, number]> = [];
  for (const col of room.columns ?? []) {
    const cx = col.position.x + col.widthCm / 2;
    const cy = col.position.y + col.depthCm / 2;
    const θ = (col.rotation * Math.PI) / 180;
    const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
    const hw = col.widthCm / 2, hd = col.depthCm / 2;
    const corners = [
      { lx: -hw, ly: -hd }, { lx: hw, ly: -hd },
      { lx:  hw, ly:  hd }, { lx: -hw, ly:  hd },
    ].map(({ lx, ly }) => ({
      x: cx + lx * cosθ - ly * sinθ,
      y: cy + lx * sinθ + ly * cosθ,
    }));
    const minPerp = Math.min(...corners.map(c => {
      const dx = c.x - wallAx, dy = c.y - wallAy;
      return Math.abs(dx * (-uy) + dy * ux);
    }));
    if (minPerp > 2) continue;
    const ts = corners.map(c => (c.x - wallAx) * ux + (c.y - wallAy) * uy);
    ranges.push([Math.min(...ts), Math.max(...ts)]);
  }
  return ranges;
}

/**
 * Push tCenter away from any overlapping blocked ranges.
 * Chooses the nearest valid position (left or right of each obstacle).
 */
export function clampAwayFromRanges(
  tCenter: number,
  halfWidth: number,
  wallLen: number,
  blockedRanges: Array<[number, number]>,
): number {
  let t = tCenter;
  // Iterate a few times in case pushing into another obstacle
  for (let pass = 0; pass < blockedRanges.length; pass++) {
    for (const [rs, re] of blockedRanges) {
      const leading  = t - halfWidth;
      const trailing = t + halfWidth;
      if (trailing <= rs || leading >= re) continue; // no overlap
      // Push to nearest side
      const pushLeft  = rs - halfWidth;
      const pushRight = re + halfWidth;
      t = Math.abs(t - pushLeft) <= Math.abs(t - pushRight) ? pushLeft : pushRight;
      t = Math.max(halfWidth, Math.min(wallLen - halfWidth, t));
    }
  }
  return t;
}

/**
 * Snap an item's along-wall position to adjacent item edges.
 * Returns delta cm (along wall) to add to tCenter, or 0 if no snap.
 */
export function snapToWallItemEdges(
  tCenter: number,
  halfWidth: number,
  snapDist: number,
  otherEdges: number[],
): number {
  const leading  = tCenter - halfWidth;
  const trailing = tCenter + halfWidth;
  let bestDist = snapDist + 1;
  let bestDelta = 0;
  for (const edge of otherEdges) {
    const d1 = Math.abs(leading - edge);
    if (d1 < snapDist && d1 < bestDist) { bestDist = d1; bestDelta = edge - leading; }
    const d2 = Math.abs(trailing - edge);
    if (d2 < snapDist && d2 < bestDist) { bestDist = d2; bestDelta = edge - trailing; }
  }
  return bestDist <= snapDist ? bestDelta : 0;
}

/**
 * Furniture snap constrained to the along-wall direction.
 *
 * Projects all piece corners onto the wall unit vector to get accurate
 * along-wall extents (works for any wall angle and any furniture rotation).
 * Also checks perpendicular overlap so only adjacent pieces trigger the snap.
 *
 * Returns the along-wall delta (cm) to move the dragged piece, or null if
 * no snap is close enough.
 */
function furnitureSnapAlongWall(
  refPos: { x: number; y: number },
  w: number,
  d: number,
  refRot: number,
  otherInstances: FurnitureInstance[],
  otherItems: Map<string, FurnitureCatalogItem>,
  wallUx: number,
  wallUy: number,
  snapDist: number,
): number | null {
  // Perpendicular-to-wall unit vector
  const perpUx = -wallUy;
  const perpUy =  wallUx;

  const myCorners = rotatedCorners(refPos, w, d, refRot);
  const myAlong   = myCorners.map(c => c.x * wallUx + c.y * wallUy);
  const myPerp    = myCorners.map(c => c.x * perpUx + c.y * perpUy);
  const myAlongMin = Math.min(...myAlong);
  const myAlongMax = Math.max(...myAlong);
  const myPerpMin  = Math.min(...myPerp);
  const myPerpMax  = Math.max(...myPerp);

  let bestDist  = snapDist + 1;
  let bestDelta = 0;

  for (const other of otherInstances) {
    const otherItem = otherItems.get(other.catalogItemId);
    if (!otherItem) continue;
    const ow = otherItem.widthCm;
    const od = otherItem.depthCm;

    const otherCorners  = rotatedCorners(other.position, ow, od, other.rotation ?? 0);
    const otherAlong    = otherCorners.map(c => c.x * wallUx + c.y * wallUy);
    const otherPerp     = otherCorners.map(c => c.x * perpUx + c.y * perpUy);
    const otherAlongMin = Math.min(...otherAlong);
    const otherAlongMax = Math.max(...otherAlong);
    const otherPerpMin  = Math.min(...otherPerp);
    const otherPerpMax  = Math.max(...otherPerp);

    // Require perpendicular overlap (pieces are side-by-side on the wall, not in front of each other)
    const perpOverlap = Math.min(myPerpMax, otherPerpMax) - Math.max(myPerpMin, otherPerpMin);
    if (perpOverlap <= -snapDist) continue;

    // My leading edge → other's trailing edge (snap piece to the right of other)
    const gapR = Math.abs(myAlongMax - otherAlongMin);
    if (gapR < snapDist && gapR < bestDist) {
      bestDist  = gapR;
      bestDelta = otherAlongMin - myAlongMax;
    }
    // My trailing edge → other's leading edge (snap piece to the left of other)
    const gapL = Math.abs(myAlongMin - otherAlongMax);
    if (gapL < snapDist && gapL < bestDist) {
      bestDist  = gapL;
      bestDelta = otherAlongMax - myAlongMin;
    }
  }

  return bestDist <= snapDist ? bestDelta : null;
}
