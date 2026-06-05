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
 * Compute the 4 side midpoints of a furniture rectangle after applying its rotation.
 * The SVG rotation is applied around the furniture's visual center.
 */
function rotatedSideMidpoints(
  pos: { x: number; y: number },
  w: number,
  d: number,
  rotDeg: number
): Record<FurnitureFrontSide, { x: number; y: number }> {
  const cx = pos.x + w / 2;
  const cy = pos.y + d / 2;
  const r = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);

  // Rotate offset (dx, dy) around center
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
 * Compute the 4 corners of a furniture rectangle after applying its rotation.
 */
function rotatedCorners(
  pos: { x: number; y: number },
  w: number,
  d: number,
  rotDeg: number
) {
  const cx = pos.x + w / 2;
  const cy = pos.y + d / 2;
  const r = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);

  const rot = (dx: number, dy: number) => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  });

  return [
    rot(-w / 2, -d / 2), // TL
    rot( w / 2, -d / 2), // TR
    rot( w / 2,  d / 2), // BR
    rot(-w / 2,  d / 2), // BL
  ];
}

/**
 * Compute snap result for a furniture item being dragged.
 *
 * Key design decisions:
 * - currentRotation is ALWAYS preserved — snap never overrides rotation.
 * - Wall snap measures distance from the ROTATED side midpoints to the wall,
 *   so whichever face is currently facing the wall will snap to it.
 * - For corner snap, rotated corners are used.
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

  // ─── Priority 1: Corner snap ────────────────────────────────────────────────
  // Snap a rotated furniture corner to a room corner.
  const furCorners = rotatedCorners(pos, w, d, currentRotation);
  for (const roomCorner of room.points) {
    for (const fc of furCorners) {
      const dist = Math.hypot(fc.x - roomCorner.x, fc.y - roomCorner.y);
      if (dist < SNAP_DISTANCE_CM && dist < bestDist) {
        bestDist = dist;
        // Offset the whole furniture so this corner lands exactly on the room corner
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

  // ─── Priority 2: Wall snap ──────────────────────────────────────────────────
  // For each wall, check each ROTATED side midpoint's distance to the wall.
  // The side midpoint that is closest to the wall determines the snap.
  // This works uniformly for axis-aligned AND angled walls.
  const mids = rotatedSideMidpoints(pos, w, d, currentRotation);
  const sideEntries = Object.entries(mids) as Array<[FurnitureFrontSide, { x: number; y: number }]>;

  for (const wall of room.walls) {
    const a = room.points[wall.startPointIndex];
    const b = room.points[wall.endPointIndex];

    for (const [side, midpoint] of sideEntries) {
      const dist = distancePointToSegment(midpoint, a, b);
      if (dist >= bestDist || dist > SNAP_DISTANCE_CM) continue;

      // Find the nearest point on the wall to this side midpoint
      const wallPt = closestPointOnSegment(midpoint, a, b);

      // The side midpoint's offset from the furniture's visual center
      const cx = pos.x + w / 2;
      const cy = pos.y + d / 2;
      const rdx = midpoint.x - cx; // rotated offset x
      const rdy = midpoint.y - cy; // rotated offset y

      // Move the furniture center so the side midpoint lands exactly on wallPt
      const newCenter = { x: wallPt.x - rdx, y: wallPt.y - rdy };
      const snappedPos = { x: newCenter.x - w / 2, y: newCenter.y - d / 2 };

      bestDist = dist;
      bestResult = {
        position: snappedPos,
        rotation: currentRotation, // rotation is ALWAYS preserved
        snappedTo: { wallId: wall.id, side },
        guideLines: [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }],
      };
    }
  }

  if (bestResult && bestDist <= SNAP_DISTANCE_CM) return bestResult;

  // ─── Priority 3: Furniture-to-furniture snap ────────────────────────────────
  for (const other of otherInstances) {
    const otherItem = otherItems.get(other.catalogItemId);
    if (!otherItem) continue;
    const ow = otherItem.widthCm;
    const od = otherItem.depthCm;
    const op = other.position;

    const checks: Array<[number, number, number, number, { x: number; y: number }]> = [
      [pos.x + w,   pos.y + d / 2, op.x,      op.y + od / 2, { x: op.x - w,      y: pos.y }],
      [pos.x,       pos.y + d / 2, op.x + ow, op.y + od / 2, { x: op.x + ow,     y: pos.y }],
      [pos.x + w/2, pos.y + d,     op.x + ow/2, op.y,        { x: pos.x,          y: op.y - d }],
      [pos.x + w/2, pos.y,         op.x + ow/2, op.y + od,   { x: pos.x,          y: op.y + od }],
    ];

    for (const [mx, my, ox, oy, snappedPos] of checks) {
      const dist = Math.hypot(mx - ox, my - oy);
      if (dist < SNAP_DISTANCE_CM && dist < bestDist) {
        bestDist = dist;
        bestResult = { position: snappedPos, rotation: currentRotation, guideLines: [] };
      }
    }
  }

  if (bestResult && bestDist <= SNAP_DISTANCE_CM) return bestResult;

  // No snap — return original position with original rotation
  return { position: pos, rotation: currentRotation, guideLines: [] };
}
