import { SNAP_DISTANCE_CM } from '../lib/constants';
import { distancePointToSegment, segmentAngleDegrees, closestPointOnSegment } from '../lib/geometry';
import type { Room, FurnitureInstance, FurnitureCatalogItem, FurnitureFrontSide } from '../types';

export interface SnapResult {
  position: { x: number; y: number };
  rotation: number;
  snappedTo?: { wallId: string; side: FurnitureFrontSide };
  guideLines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

function furnitureCorners(pos: { x: number; y: number }, w: number, d: number) {
  return [
    { x: pos.x, y: pos.y },
    { x: pos.x + w, y: pos.y },
    { x: pos.x + w, y: pos.y + d },
    { x: pos.x, y: pos.y + d },
  ];
}

function furnitureSideMidpoints(pos: { x: number; y: number }, w: number, d: number) {
  return {
    top: { x: pos.x + w / 2, y: pos.y },
    right: { x: pos.x + w, y: pos.y + d / 2 },
    bottom: { x: pos.x + w / 2, y: pos.y + d },
    left: { x: pos.x, y: pos.y + d / 2 },
  };
}

export function computeSnap(
  pos: { x: number; y: number },
  item: FurnitureCatalogItem,
  room: Room | null,
  otherInstances: FurnitureInstance[],
  otherItems: Map<string, FurnitureCatalogItem>
): SnapResult {
  if (!room) return { position: pos, rotation: 0, guideLines: [] };

  const w = item.widthCm;
  const d = item.depthCm;

  let bestDist = SNAP_DISTANCE_CM + 1;
  let bestResult: SnapResult | null = null;

  // --- Corner snap (Priority 1) — snap furniture corner to room corner ---
  // Checked FIRST so furniture lands flush against both walls at a corner.
  const corners = furnitureCorners(pos, w, d);
  for (const roomCorner of room.points) {
    for (const fc of corners) {
      const dist = Math.hypot(fc.x - roomCorner.x, fc.y - roomCorner.y);
      if (dist < SNAP_DISTANCE_CM && dist < bestDist) {
        bestDist = dist;
        bestResult = {
          position: { x: pos.x + (roomCorner.x - fc.x), y: pos.y + (roomCorner.y - fc.y) },
          rotation: 0,
          guideLines: [],
        };
      }
    }
  }

  if (bestResult && bestDist <= SNAP_DISTANCE_CM) return bestResult;

  // --- Wall snap (Priority 2) ---
  const mids = furnitureSideMidpoints(pos, w, d);
  const sideEntries = Object.entries(mids) as Array<[FurnitureFrontSide, { x: number; y: number }]>;

  for (const wall of room.walls) {
    const a = room.points[wall.startPointIndex];
    const b = room.points[wall.endPointIndex];
    const wallAngleDeg = segmentAngleDegrees(a, b);
    const isAxisAligned = Math.abs(wallAngleDeg % 90) < 5 || Math.abs(wallAngleDeg % 90) > 85;

    for (const [side, midpoint] of sideEntries) {
      const dist = distancePointToSegment(midpoint, a, b);
      if (dist >= bestDist) continue;

      let snappedPos = { ...pos };
      let snappedRotation = 0;

      if (isAxisAligned) {
        const wallIsHoriz = Math.abs(wallAngleDeg % 180) < 5 || Math.abs(wallAngleDeg % 180) > 175;
        if (wallIsHoriz) {
          const wallY = a.y;
          if (side === 'top') snappedPos = { x: pos.x, y: wallY };
          else if (side === 'bottom') snappedPos = { x: pos.x, y: wallY - d };
          else continue;
        } else {
          const wallX = a.x;
          if (side === 'left') snappedPos = { x: wallX, y: pos.y };
          else if (side === 'right') snappedPos = { x: wallX - w, y: pos.y };
          else continue;
        }
        snappedRotation = 0;
      } else {
        // Angled wall: use furniture CENTER distance to wall for trigger,
        // then position the furniture flush against the wall with correct rotation.
        const center = { x: pos.x + w / 2, y: pos.y + d / 2 };
        const centerDist = distancePointToSegment(center, a, b);
        if (centerDist >= bestDist || centerDist > SNAP_DISTANCE_CM) continue;

        // Wall unit vector and inward normal
        const wallLen = Math.hypot(b.x - a.x, b.y - a.y);
        if (wallLen < 1) continue;
        const ux = (b.x - a.x) / wallLen;
        const uy = (b.y - a.y) / wallLen;
        const nx = -uy; // inward normal (rotated 90° CCW from wall direction)
        const ny = ux;

        // Nearest point on wall to furniture center
        const wallPt = closestPointOnSegment(center, a, b);

        // Determine which side of the wall the furniture is on
        // so we always snap to the SAME side (don't flip across the wall)
        const wallToCenter = { x: center.x - wallPt.x, y: center.y - wallPt.y };
        const sideSign = (wallToCenter.x * nx + wallToCenter.y * ny) >= 0 ? 1 : -1;

        // When furniture rotation = wallAngleDeg, its "depth" axis aligns with the wall normal.
        // The furniture center is offset from the wall by (d/2) along the normal.
        const newCenter = {
          x: wallPt.x + (d / 2) * sideSign * nx,
          y: wallPt.y + (d / 2) * sideSign * ny,
        };
        snappedPos = { x: newCenter.x - w / 2, y: newCenter.y - d / 2 };
        snappedRotation = wallAngleDeg;

        bestDist = centerDist;
        bestResult = {
          position: snappedPos,
          rotation: snappedRotation,
          snappedTo: { wallId: wall.id, side },
          guideLines: [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }],
        };
        continue; // skip the common bestDist/bestResult assignment below
      }

      bestDist = dist;
      bestResult = {
        position: snappedPos,
        rotation: snappedRotation,
        snappedTo: { wallId: wall.id, side },
        guideLines: [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }],
      };
    }
  }

  if (bestResult && bestDist <= SNAP_DISTANCE_CM) return bestResult;

  // --- Furniture-to-furniture snap (Priority 3) ---
  for (const other of otherInstances) {
    const otherItem = otherItems.get(other.catalogItemId);
    if (!otherItem) continue;
    const ow = otherItem.widthCm;
    const od = otherItem.depthCm;
    const op = other.position;

    const checks: Array<[number, number, number, number, { x: number; y: number }]> = [
      [pos.x + w, pos.y + d / 2, op.x, op.y + od / 2, { x: op.x - w, y: pos.y }],
      [pos.x, pos.y + d / 2, op.x + ow, op.y + od / 2, { x: op.x + ow, y: pos.y }],
      [pos.x + w / 2, pos.y + d, op.x + ow / 2, op.y, { x: pos.x, y: op.y - d }],
      [pos.x + w / 2, pos.y, op.x + ow / 2, op.y + od, { x: pos.x, y: op.y + od }],
    ];

    for (const [mx, my, ox, oy, snappedPos] of checks) {
      const dist = Math.hypot(mx - ox, my - oy);
      if (dist < SNAP_DISTANCE_CM && dist < bestDist) {
        bestDist = dist;
        bestResult = { position: snappedPos, rotation: 0, guideLines: [] };
      }
    }
  }

  if (bestResult && bestDist <= SNAP_DISTANCE_CM) return bestResult;

  return { position: pos, rotation: 0, guideLines: [] };
}
