import { memo } from 'react';
import { cmToPx } from '../../lib/geometry';
import type { FurnitureShapeType, FurnitureFrontSide } from '../../types';

interface Props {
  shapeType: FurnitureShapeType;
  widthCm: number;
  depthCm: number;
  params?: Record<string, unknown> | null;
  frontSide: FurnitureFrontSide;
  isSelected?: boolean;
}

const FILL = 'var(--color-furniture-fill)';
const FILL_OPACITY = 0.82;
const STROKE = 'var(--color-furniture-border)';
const FRONT_STROKE = 'var(--color-furniture-border)';

function FrontIndicator({ widthPx, depthPx, frontSide }: { widthPx: number; depthPx: number; frontSide: FurnitureFrontSide }) {
  const offset = 2;
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
  if (frontSide === 'bottom') { x1 = offset; y1 = depthPx; x2 = widthPx - offset; y2 = depthPx; }
  else if (frontSide === 'top') { x1 = offset; y1 = 0; x2 = widthPx - offset; y2 = 0; }
  else if (frontSide === 'left') { x1 = 0; y1 = offset; x2 = 0; y2 = depthPx - offset; }
  else { x1 = widthPx; y1 = offset; x2 = widthPx; y2 = depthPx - offset; }

  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={FRONT_STROKE} strokeWidth={2.5} strokeOpacity={0.7} />;
}

export const FurnitureShape = memo(function FurnitureShape({ shapeType, widthCm, depthCm, params, frontSide, isSelected }: Props) {
  const w = cmToPx(widthCm);
  const d = cmToPx(depthCm);

  const selectionStroke = isSelected ? 'var(--color-primary)' : 'none';

  let shape: React.ReactNode;

  if (shapeType === 'rectangle' || shapeType === 'square') {
    shape = (
      <>
        <rect x={0} y={0} width={w} height={d} fill={FILL} stroke={STROKE} strokeWidth={1} rx={1} />
        <FrontIndicator widthPx={w} depthPx={d} frontSide={frontSide} />
        {isSelected && (
          <rect x={-2} y={-2} width={w + 4} height={d + 4} fill="none" stroke={selectionStroke} strokeWidth={1.5} strokeDasharray="4 3" rx={2} />
        )}
      </>
    );
  } else if (shapeType === 'circle') {
    const r = Math.min(w, d) / 2;
    shape = (
      <>
        <circle cx={w / 2} cy={d / 2} r={r} fill={FILL} stroke={STROKE} strokeWidth={1} />
        {isSelected && (
          <circle cx={w / 2} cy={d / 2} r={r + 3} fill="none" stroke={selectionStroke} strokeWidth={1.5} strokeDasharray="4 3" />
        )}
      </>
    );
  } else if (shapeType === 'semicircle') {
    const rx = w / 2;
    const ry = d;
    const path = `M 0 ${ry} A ${rx} ${ry} 0 0 1 ${w} ${ry} Z`;
    shape = (
      <>
        <path d={path} fill={FILL} stroke={STROKE} strokeWidth={1} />
        <FrontIndicator widthPx={w} depthPx={d} frontSide={frontSide} />
        {isSelected && (
          <rect x={-2} y={-2} width={w + 4} height={d + 4} fill="none" stroke={selectionStroke} strokeWidth={1.5} strokeDasharray="4 3" rx={2} />
        )}
      </>
    );
  } else if (shapeType === 'quarterCircle') {
    const corner = (params?.corner as string) ?? 'topLeft';
    let path = '';
    if (corner === 'topLeft') path = `M 0 0 L ${w} 0 A ${w} ${d} 0 0 0 0 ${d} Z`;
    else if (corner === 'topRight') path = `M ${w} 0 L ${w} ${d} A ${w} ${d} 0 0 0 0 0 Z`;
    else if (corner === 'bottomRight') path = `M ${w} ${d} L 0 ${d} A ${w} ${d} 0 0 0 ${w} 0 Z`;
    else path = `M 0 ${d} L 0 0 A ${w} ${d} 0 0 1 ${w} ${d} Z`;
    shape = (
      <>
        <path d={path} fill={FILL} stroke={STROKE} strokeWidth={1} />
        {isSelected && (
          <rect x={-2} y={-2} width={w + 4} height={d + 4} fill="none" stroke={selectionStroke} strokeWidth={1.5} strokeDasharray="4 3" rx={2} />
        )}
      </>
    );
  } else if (shapeType === 'chamferedRectangle') {
    const chamfer = cmToPx((params?.chamferCm as number) ?? 20);
    const c = Math.min(chamfer, w * 0.4, d * 0.4);
    const path = `M ${c} 0 L ${w - c} 0 L ${w} ${c} L ${w} ${d - c} L ${w - c} ${d} L ${c} ${d} L 0 ${d - c} L 0 ${c} Z`;
    shape = (
      <>
        <path d={path} fill={FILL} stroke={STROKE} strokeWidth={1} />
        <FrontIndicator widthPx={w} depthPx={d} frontSide={frontSide} />
        {isSelected && (
          <rect x={-2} y={-2} width={w + 4} height={d + 4} fill="none" stroke={selectionStroke} strokeWidth={1.5} strokeDasharray="4 3" rx={2} />
        )}
      </>
    );
  } else if (shapeType === 'cornerCabinet') {
    // Triangle occupying the corner (diagonal front)
    const path = `M 0 0 L ${w} 0 L 0 ${d} Z`;
    shape = (
      <>
        <path d={path} fill={FILL} stroke={STROKE} strokeWidth={1} />
        {isSelected && (
          <rect x={-2} y={-2} width={w + 4} height={d + 4} fill="none" stroke={selectionStroke} strokeWidth={1.5} strokeDasharray="4 3" rx={2} />
        )}
      </>
    );
  } else {
    shape = <rect x={0} y={0} width={w} height={d} fill={FILL} stroke={STROKE} strokeWidth={1} />;
  }

  return <g fillOpacity={FILL_OPACITY}>{shape}</g>;
});
