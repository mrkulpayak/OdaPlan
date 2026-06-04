import { memo } from 'react';
import type { Point } from '../../types';
import { cmToPx } from '../../lib/geometry';

interface Props {
  cornerPt: Point;       // shared corner in cm
  wallAEnd: Point;       // the other end of wall A in cm
  wallBEnd: Point;       // the other end of wall B in cm
  constraintId: string;
  onRemove: (id: string) => void;
}

const SYMBOL_SIZE = 8; // px

export const ConstraintSymbol = memo(function ConstraintSymbol({
  cornerPt, wallAEnd, wallBEnd, constraintId, onRemove,
}: Props) {
  const cx = cmToPx(cornerPt.x);
  const cy = cmToPx(cornerPt.y);

  // Unit vectors along each wall away from the corner
  const ax = cmToPx(wallAEnd.x) - cx;
  const ay = cmToPx(wallAEnd.y) - cy;
  const aLen = Math.hypot(ax, ay);
  const bx = cmToPx(wallBEnd.x) - cx;
  const by = cmToPx(wallBEnd.y) - cy;
  const bLen = Math.hypot(bx, by);

  if (aLen === 0 || bLen === 0) return null;

  const uax = ax / aLen;
  const uay = ay / aLen;
  const ubx = bx / bLen;
  const uby = by / bLen;

  // Square symbol points: corner, point along A, diagonal, point along B
  const S = SYMBOL_SIZE;
  const p0 = { x: cx, y: cy };
  const p1 = { x: cx + uax * S, y: cy + uay * S };
  const p2 = { x: cx + uax * S + ubx * S, y: cy + uay * S + uby * S };
  const p3 = { x: cx + ubx * S, y: cy + uby * S };

  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={() => onRemove(constraintId)}
    >
      {/* Hit area */}
      <circle cx={p0.x + (uax + ubx) * S * 0.5} cy={p0.y + (uay + uby) * S * 0.5} r={10} fill="transparent" />
      {/* Right-angle square: two sides of a small square at the corner */}
      <polyline
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={1.5}
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
});
