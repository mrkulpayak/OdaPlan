import { CM_TO_PX } from './constants';
import type { Point, FurnitureFrontSide, Wall, Room } from '../types';

/**
 * Traversal-based signed area of the room polygon (via wall connections).
 * Positive = CCW in screen space (Y-down), negative = CW.
 */
function roomTraversalSignedArea(room: Room): number {
  if (room.walls.length === 0) return 0;
  const wallFrom = new Map(room.walls.map(w => [w.startPointIndex, w]));
  let cur = room.walls[0];
  const startId = cur.id;
  let sum = 0;
  let count = 0;
  do {
    const a = room.points[cur.startPointIndex];
    const b = room.points[cur.endPointIndex];
    sum += a.x * b.y - b.x * a.y;
    const next = wallFrom.get(cur.endPointIndex);
    if (!next || next.id === startId || ++count > room.walls.length) break;
    cur = next;
  } while (true);
  return sum / 2;
}

/**
 * Returns true if the given endpoint of `wall` is a convex (outward) corner.
 * atEnd=false → startPointIndex, atEnd=true → endPointIndex.
 */
export function isWallEndpointConvex(room: Room, wall: Wall, atEnd: boolean): boolean {
  const ptIdx = atEnd ? wall.endPointIndex : wall.startPointIndex;
  const curr = room.points[ptIdx];

  let inVec: Point, outVec: Point;
  if (atEnd) {
    const from = room.points[wall.startPointIndex];
    inVec = { x: curr.x - from.x, y: curr.y - from.y };
    const nw = room.walls.find(w => w.startPointIndex === ptIdx && w.id !== wall.id);
    if (!nw) return true;
    const to = room.points[nw.endPointIndex];
    outVec = { x: to.x - curr.x, y: to.y - curr.y };
  } else {
    const to = room.points[wall.endPointIndex];
    outVec = { x: to.x - curr.x, y: to.y - curr.y };
    const pw = room.walls.find(w => w.endPointIndex === ptIdx && w.id !== wall.id);
    if (!pw) return true;
    const from = room.points[pw.startPointIndex];
    inVec = { x: curr.x - from.x, y: curr.y - from.y };
  }

  const cross = inVec.x * outVec.y - inVec.y * outVec.x;
  const area = roomTraversalSignedArea(room);
  // area > 0 (CCW screen): convex when cross > 0
  // area < 0 (CW screen):  convex when cross < 0
  return area > 0 ? cross > 0 : cross < 0;
}

export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function segmentLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function segmentAngleDegrees(a: Point, b: Point): number {
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
  return (angle + 360) % 360;
}

export function snapToOrthogonal(
  a: Point,
  b: Point,
  threshold: number
): { a: Point; b: Point } {
  const angle = segmentAngleDegrees(a, b);
  const normalized = angle % 90;
  const distFromOrthogonal = Math.min(normalized, 90 - normalized);
  if (distFromOrthogonal <= threshold) {
    const nearestOrthogonal = Math.round(angle / 90) * 90;
    const len = segmentLength(a, b);
    const rad = (nearestOrthogonal * Math.PI) / 180;
    return {
      a,
      b: { x: a.x + len * Math.cos(rad), y: a.y + len * Math.sin(rad) },
    };
  }
  return { a, b };
}

export function wallMidpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function cmToPx(cm: number): number {
  return cm * CM_TO_PX;
}

export function pxToCm(px: number): number {
  return px / CM_TO_PX;
}

/**
 * Compute the offset vector from a furniture's VISUAL CENTER to its snapped face midpoint,
 * accounting for the furniture's rotation (SVG rotate(θ) around center).
 *
 * SVG rotate(θ) maps (dx,dy) → (dx cosθ − dy sinθ, dx sinθ + dy cosθ)
 *
 *  top    : unrotated (0, −d/2)  → (+(d/2)sinθ, −(d/2)cosθ)
 *  bottom : unrotated (0, +d/2)  → (−(d/2)sinθ, +(d/2)cosθ)
 *  left   : unrotated (−w/2, 0)  → (−(w/2)cosθ, −(w/2)sinθ)
 *  right  : unrotated (+w/2, 0)  → (+(w/2)cosθ, +(w/2)sinθ)
 */
export function faceMidpointOffset(
  side: FurnitureFrontSide,
  widthCm: number,
  depthCm: number,
  rotDeg: number
): { x: number; y: number } {
  const θ   = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(θ);
  const sin = Math.sin(θ);
  const w2  = widthCm / 2;
  const d2  = depthCm / 2;
  switch (side) {
    case 'top':    return { x:  d2 * sin, y: -d2 * cos };
    case 'bottom': return { x: -d2 * sin, y:  d2 * cos };
    case 'left':   return { x: -w2 * cos, y: -w2 * sin };
    case 'right':  return { x:  w2 * cos, y:  w2 * sin };
  }
}
