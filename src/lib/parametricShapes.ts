// Parametric furniture shapes — pure math, no React, no side effects.
//
// A parametric shape is defined by overall catalog dimensions (widthCm ×
// depthCm) plus shape-specific params. It produces two outputs:
//
//   pieces  — the rectangles actually rendered (cushions, arms, backrest)
//   outline — the bounding polygon used for snap and selection. This is the
//             surface that meets walls; it is NEVER rendered as a visible
//             outline (see docs/parametric-shapes.md).
//
// All coordinates are centimeters, origin at the shape's top-left corner.
// New shapes designed in collaboration sessions get added here as new
// compute functions and a branch in computeParametricShape().

import type { Point } from '../types';

export interface ShapePieceCm {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ParametricShape {
  pieces: ShapePieceCm[];
  outline: Point[];
}

// ── Sofa family construction constants (cm) ─────────────────────────
const SOFA_BACK_CM = 18; // backrest depth
const SOFA_ARM_CM = 14; // armrest width
const SOFA_INSET_CM = 2; // gap between pieces and the invisible outline
const SOFA_GAP_CM = 2; // gap between adjacent pieces

// Backrest + two equal arms; arms run from the top edge to the body front.
// Cushions fill the inner span between the arms with equal widths.
function sofaFrame(A: number, B: number): ShapePieceCm[] {
  const xs = SOFA_INSET_CM + SOFA_ARM_CM + SOFA_GAP_CM;
  return [
    { x: xs, y: SOFA_INSET_CM, w: A - 2 * xs, h: SOFA_BACK_CM - SOFA_INSET_CM - SOFA_GAP_CM },
    { x: SOFA_INSET_CM, y: SOFA_INSET_CM, w: SOFA_ARM_CM, h: B - 2 * SOFA_INSET_CM },
    { x: A - SOFA_INSET_CM - SOFA_ARM_CM, y: SOFA_INSET_CM, w: SOFA_ARM_CM, h: B - 2 * SOFA_INSET_CM },
  ];
}

function cushionWidth(A: number, count: number): number {
  const xs = SOFA_INSET_CM + SOFA_ARM_CM + SOFA_GAP_CM;
  const span = A - 2 * xs;
  return Math.max((span - (count - 1) * SOFA_GAP_CM) / count, 5);
}

// ── Straight sofa (sofa) ────────────────────────────────────────────
// Inputs:  A = widthCm, B = depthCm
//          params.seatCount (1 | 2 | 3, default 3) — cushion count
// Outline is the plain A × B rectangle.

export interface SofaParams {
  seatCount?: number;
}

export function computeSofa(
  widthCm: number,
  depthCm: number,
  params?: SofaParams | null
): ParametricShape {
  const A = widthCm;
  const B = depthCm;
  const n = Math.min(3, Math.max(1, Math.round(params?.seatCount ?? 3)));

  const xs = SOFA_INSET_CM + SOFA_ARM_CM + SOFA_GAP_CM;
  const cushion = cushionWidth(A, n);
  const pieces = sofaFrame(A, B);
  for (let k = 0; k < n; k++) {
    pieces.push({
      x: xs + k * (cushion + SOFA_GAP_CM),
      y: SOFA_BACK_CM,
      w: cushion,
      h: B - SOFA_BACK_CM - SOFA_INSET_CM,
    });
  }

  const outline: Point[] = [
    { x: 0, y: 0 },
    { x: A, y: 0 },
    { x: A, y: B },
    { x: 0, y: B },
  ];

  return { pieces, outline };
}

// ── L sofa (lSofa) ──────────────────────────────────────────────────
// Inputs:  A = widthCm (total width), C = depthCm (chaise depth),
//          B = params.bodyDepthCm (main body depth, default 95),
//          params.chaiseSide ('left' | 'right', default 'left')
// Derived: D (chaise width) and E = A − D fall out of the equal-cushion
//          rule; cushion count is fixed at 3.

export interface LSofaParams {
  bodyDepthCm?: number;
  chaiseSide?: 'left' | 'right';
}

const L_CUSHION_COUNT = 3;
const L_MIN_CHAISE_EXTENT_CM = 40; // chaise must extend past body by this

export function computeLSofa(
  widthCm: number,
  depthCm: number,
  params?: LSofaParams | null
): ParametricShape {
  const A = widthCm;
  const C = depthCm;
  const B = Math.min(params?.bodyDepthCm ?? 95, C - L_MIN_CHAISE_EXTENT_CM);
  const side = params?.chaiseSide ?? 'left';

  const xs = SOFA_INSET_CM + SOFA_ARM_CM + SOFA_GAP_CM;
  const cushion = cushionWidth(A, L_CUSHION_COUNT);
  const chaiseWidth = xs + cushion + SOFA_GAP_CM; // = D

  let pieces = sofaFrame(A, B);
  // Chaise cushion: first column, runs uninterrupted from backrest to C
  pieces.push({ x: xs, y: SOFA_BACK_CM, w: cushion, h: C - SOFA_BACK_CM - SOFA_INSET_CM });
  for (let k = 1; k < L_CUSHION_COUNT; k++) {
    pieces.push({
      x: xs + k * (cushion + SOFA_GAP_CM),
      y: SOFA_BACK_CM,
      w: cushion,
      h: B - SOFA_BACK_CM - SOFA_INSET_CM,
    });
  }

  let outline: Point[] = [
    { x: 0, y: 0 },
    { x: A, y: 0 },
    { x: A, y: B },
    { x: chaiseWidth, y: B },
    { x: chaiseWidth, y: C },
    { x: 0, y: C },
  ];

  if (side === 'right') {
    pieces = pieces.map((p) => ({ ...p, x: A - p.x - p.w }));
    outline = outline.map((p) => ({ x: A - p.x, y: p.y }));
  }

  return { pieces, outline };
}

// ── Case furniture (cabinet, drawerUnit) ────────────────────────────
// Top-down: carcass top panel + 18 mm front strip(s) at the bottom edge.
// Inputs are width/depth only — no params.
//   cabinet    — front split into equal doors, count = round(A / 50), min 1
//                (doors stay in the standard 45–60 cm band)
//   drawerUnit — single full-width front regardless of size (drawers:
//                komodin, şifonyer)

const CASE_FRONT_CM = 1.8; // 18 mm door / drawer front
const CASE_DOOR_STD_CM = 50; // standard door width target

function computeCaseUnit(widthCm: number, depthCm: number, doorCount: number): ParametricShape {
  const A = widthCm;
  const B = depthCm;
  const doorWidth = A / doorCount;

  const pieces: ShapePieceCm[] = [
    { x: 0, y: 0, w: A, h: B - CASE_FRONT_CM },
  ];
  for (let k = 0; k < doorCount; k++) {
    pieces.push({ x: k * doorWidth, y: B - CASE_FRONT_CM, w: doorWidth, h: CASE_FRONT_CM });
  }

  const outline: Point[] = [
    { x: 0, y: 0 },
    { x: A, y: 0 },
    { x: A, y: B },
    { x: 0, y: B },
  ];

  return { pieces, outline };
}

export function computeCabinet(widthCm: number, depthCm: number): ParametricShape {
  const doorCount = Math.max(1, Math.round(widthCm / CASE_DOOR_STD_CM));
  return computeCaseUnit(widthCm, depthCm, doorCount);
}

export function computeDrawerUnit(widthCm: number, depthCm: number): ParametricShape {
  return computeCaseUnit(widthCm, depthCm, 1);
}

// ── Registry ────────────────────────────────────────────────────────

export function computeParametricShape(
  shapeType: string,
  widthCm: number,
  depthCm: number,
  params?: Record<string, unknown> | null
): ParametricShape | null {
  if (shapeType === 'sofa') {
    return computeSofa(widthCm, depthCm, params as SofaParams | null);
  }
  if (shapeType === 'lSofa') {
    return computeLSofa(widthCm, depthCm, params as LSofaParams | null);
  }
  if (shapeType === 'cabinet') {
    return computeCabinet(widthCm, depthCm);
  }
  if (shapeType === 'drawerUnit') {
    return computeDrawerUnit(widthCm, depthCm);
  }
  return null;
}
