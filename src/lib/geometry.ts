import { CM_TO_PX } from './constants';
import type { Point } from '../types';

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
