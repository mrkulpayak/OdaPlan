import { CM_TO_PX } from './constants';
import type { Point, FurnitureFrontSide } from '../types';

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
