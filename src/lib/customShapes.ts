/**
 * Geometry helpers for parametric custom shapes.
 * All coordinates are in centimetres.
 */
import type { CustomShapeType } from '../types';

// ── Default dimensions ────────────────────────────────────────────────────
export const DEFAULT_DIMS: Record<CustomShapeType, Record<string, number>> = {
  rect:      { A: 80,  B: 60 },
  'l-shape': { A: 200, B: 150, C: 80, D: 80 },
  chamfered: { A: 100, B: 80,  C: 20 },
};

/** Independent dim keys per shape (the ones the user edits) */
export const DIM_KEYS: Record<CustomShapeType, string[]> = {
  rect:      ['A', 'B'],
  'l-shape': ['A', 'B', 'C', 'D'],
  chamfered: ['A', 'B', 'C'],
};

/** Human-readable label for each dim key */
export const DIM_LABELS: Record<CustomShapeType, Record<string, string>> = {
  rect:      { A: 'Genişlik', B: 'Derinlik' },
  'l-shape': { A: 'Dış Genişlik', B: 'Dış Derinlik', C: 'Kesim Gen.', D: 'Kesim Der.' },
  chamfered: { A: 'Genişlik',    B: 'Derinlik',      C: 'Pah' },
};

export const SHAPE_NAMES: Record<CustomShapeType, string> = {
  rect:      'Dikdörtgen',
  'l-shape': 'L Form',
  chamfered: 'Pahlı',
};

// ── Polygon ───────────────────────────────────────────────────────────────
/** Returns polygon vertices in cm, relative to shape top-left (0,0). */
export function shapePolygonCm(
  type: CustomShapeType,
  dims: Record<string, number>,
  mirrorX = false,
): { x: number; y: number }[] {
  const A = dims.A ?? 80;
  const B = dims.B ?? 60;

  let pts: { x: number; y: number }[];

  switch (type) {
    case 'rect':
      pts = [
        { x: 0, y: 0 }, { x: A, y: 0 },
        { x: A, y: B }, { x: 0, y: B },
      ];
      break;

    case 'l-shape': {
      const C = Math.min(dims.C ?? 80, A - 5);
      const D = Math.min(dims.D ?? 80, B - 5);
      pts = [
        { x: 0,     y: 0     },
        { x: A,     y: 0     },
        { x: A,     y: B - D },
        { x: A - C, y: B - D },
        { x: A - C, y: B     },
        { x: 0,     y: B     },
      ];
      break;
    }

    case 'chamfered': {
      const C = Math.min(dims.C ?? 20, A - 5, B - 5);
      pts = [
        { x: 0,     y: 0 },
        { x: A - C, y: 0 },
        { x: A,     y: C },
        { x: A,     y: B },
        { x: 0,     y: B },
      ];
      break;
    }

    default:
      pts = [];
  }

  // Apply horizontal mirror: x' = A - x
  return mirrorX ? pts.map((p) => ({ x: A - p.x, y: p.y })) : pts;
}

/**
 * Mirror polygon points horizontally around the bounding box center.
 * x' = A - x  (bounding box width stays the same).
 */
export function mirrorPolygonX(
  pts: { x: number; y: number }[],
  A: number,
): { x: number; y: number }[] {
  return pts.map((p) => ({ x: A - p.x, y: p.y }));
}

/** Bounding box (cm) — always A × B. */
export function shapeBBox(dims: Record<string, number>): { w: number; h: number } {
  return { w: dims.A ?? 80, h: dims.B ?? 60 };
}

/** Convert cm polygon to SVG `points` attribute string (px = cm × cmToPx). */
export function polygonToSVGPoints(
  pts: { x: number; y: number }[],
  cmToPx: (v: number) => number,
): string {
  return pts.map((p) => `${cmToPx(p.x)},${cmToPx(p.y)}`).join(' ');
}

// ── Edge annotations (for dimension editor labels) ────────────────────────
export interface EdgeAnnotation {
  label: string;
  /** Midpoint of the edge in cm */
  mx: number;
  my: number;
  /** Normal offset direction (outward) — for placing label outside shape */
  nx: number;
  ny: number;
  /** cm value to display */
  value: number;
  /** Is this an independently editable dim? */
  isInput: boolean;
  dimKey: string; // key in dims record
}

export function shapeEdgeAnnotations(
  type: CustomShapeType,
  dims: Record<string, number>,
  mirrorX = false,
): EdgeAnnotation[] {
  const A = dims.A ?? 80;
  const B = dims.B ?? 60;

  let result: EdgeAnnotation[];

  switch (type) {
    case 'rect':
      result = [
        { label: 'A', mx: A / 2, my: 0,   nx: 0,  ny: -1, value: A, isInput: true, dimKey: 'A' },
        { label: 'B', mx: A,     my: B/2,  nx: 1,  ny: 0,  value: B, isInput: true, dimKey: 'B' },
      ];
      break;

    case 'l-shape': {
      const C = Math.min(dims.C ?? 80, A - 5);
      const D = Math.min(dims.D ?? 80, B - 5);
      result = [
        { label: 'A', mx: A / 2,          my: 0,           nx: 0,  ny: -1, value: A, isInput: true, dimKey: 'A' },
        { label: 'B', mx: 0,              my: B / 2,       nx: -1, ny: 0,  value: B, isInput: true, dimKey: 'B' },
        { label: 'C', mx: A - C / 2,      my: B - D,       nx: 0,  ny: -1, value: C, isInput: true, dimKey: 'C' },
        { label: 'D', mx: A - C,          my: B - D / 2,   nx: 1,  ny: 0,  value: D, isInput: true, dimKey: 'D' },
      ];
      break;
    }

    case 'chamfered': {
      const C = Math.min(dims.C ?? 20, A - 5, B - 5);
      result = [
        { label: 'A', mx: A / 2,       my: B,       nx: 0,      ny: 1,      value: A, isInput: true, dimKey: 'A' },
        { label: 'B', mx: 0,           my: B / 2,   nx: -1,     ny: 0,      value: B, isInput: true, dimKey: 'B' },
        { label: 'C', mx: A - C / 2,   my: C / 2,   nx: 0.707,  ny: -0.707, value: C, isInput: true, dimKey: 'C' },
      ];
      break;
    }

    default:
      result = [];
  }

  // Mirror annotation positions: mx' = A - mx, nx' = -nx
  if (mirrorX) {
    result = result.map((a) => ({ ...a, mx: A - a.mx, nx: -a.nx }));
  }
  return result;
}
