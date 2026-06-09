import { memo, useRef } from 'react';
import { cmToPx } from '../../lib/geometry';
import { RADIAL_R0 } from './RadialRotateMenu';
import type { FurnitureFrontSide } from '../../types';

interface Props {
  widthCm: number;
  depthCm: number;
  rotation: number;
  zoom: number;
  frontSide?: FurnitureFrontSide;
  radialActive?: boolean;
  onStartMoveDrag: (e: React.PointerEvent) => void;
  onRotate90: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOpenRadial: () => void;
  /** Optional: show a horizontal flip button (custom shapes only) */
  onFlip?: () => void;
  /** Whether the shape is currently mirrored (to show active state) */
  isMirrored?: boolean;
}

const HOLD_MS = 350;

export const SelectionHandles = memo(function SelectionHandles({
  widthCm, depthCm, rotation, zoom, radialActive = false,
  onStartMoveDrag, onRotate90, onDelete, onDuplicate, onOpenRadial,
  onFlip, isMirrored,
}: Props) {
  const w = cmToPx(widthCm);
  const d = cmToPx(depthCm);
  const cx = w / 2;
  const cy = d / 2;

  const BTN_R   = (RADIAL_R0 * 0.55) / zoom;
  const BTN_GAP = BTN_R * 2 + 6 / zoom;

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHoldRef   = useRef(false);

  const handleRotatePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    didHoldRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      didHoldRef.current = true;
      onOpenRadial();
    }, HOLD_MS);
  };

  const handleRotatePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!didHoldRef.current) {
      onRotate90();
    }
  };

  const handleDelete = (e: React.PointerEvent) => {
    e.stopPropagation();
    onDelete();
  };

  const handleDuplicate = (e: React.PointerEvent) => {
    e.stopPropagation();
    onDuplicate();
  };

  return (
    <g>
      {/* Transparent drag area over the furniture body */}
      <rect
        x={0} y={0} width={w} height={d}
        fill="transparent"
        style={{ cursor: 'move' }}
        onPointerDown={onStartMoveDrag}
      />

      {/* Counter-rotate group so buttons always appear upright */}
      <g transform={`rotate(${-rotation}, ${cx}, ${cy})`}>

        {/* ── Rotate button (center) ── */}
        <g
          transform={`translate(${cx}, ${cy})`}
          style={{ cursor: 'pointer' }}
          onPointerDown={handleRotatePointerDown}
          onPointerUp={handleRotatePointerUp}
          role="button"
          aria-label="Döndür"
        >
          <circle r={BTN_R} fill="rgba(255,255,255,0.88)" stroke="rgba(0,0,0,0.18)" strokeWidth={BTN_R * 0.06} />
          <g transform={`scale(${BTN_R * 1.1 / 24}) translate(-12,-12)`}
            fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </g>
        </g>

        {/* ── Delete button (right of center) — hidden while radial is active ── */}
        {!radialActive && (
          <g
            transform={`translate(${cx + BTN_GAP}, ${cy})`}
            style={{ cursor: 'pointer' }}
            onPointerDown={handleDelete}
            role="button"
            aria-label="Sil"
          >
            <circle r={BTN_R} fill="rgba(255,255,255,0.88)" stroke="rgba(0,0,0,0.18)" strokeWidth={BTN_R * 0.06} />
            <g transform={`scale(${BTN_R * 1.1 / 24}) translate(-12,-12)`}
              fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={2.2}
              strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </g>
          </g>
        )}

        {/* ── Duplicate button (left of center) — hidden while radial is active ── */}
        {!radialActive && (
          <g
            transform={`translate(${cx - BTN_GAP}, ${cy})`}
            style={{ cursor: 'pointer' }}
            onPointerDown={handleDuplicate}
            role="button"
            aria-label="Kopyala"
          >
            <circle r={BTN_R} fill="rgba(255,255,255,0.88)" stroke="rgba(0,0,0,0.18)" strokeWidth={BTN_R * 0.06} />
            <g transform={`scale(${BTN_R * 1.1 / 24}) translate(-12,-12)`}
              fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={2.2}
              strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </g>
          </g>
        )}

        {/* ── Flip button (below center) — only when onFlip is provided ── */}
        {!radialActive && onFlip && (
          <g
            transform={`translate(${cx}, ${cy + BTN_GAP})`}
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => { e.stopPropagation(); onFlip(); }}
            role="button"
            aria-label="Yatay Aynala"
          >
            <circle r={BTN_R}
              fill={isMirrored ? 'var(--color-accent)' : 'rgba(255,255,255,0.88)'}
              stroke="rgba(0,0,0,0.18)" strokeWidth={BTN_R * 0.06} />
            {/* Flip horizontal icon: two arrows pointing outward + vertical line */}
            <g transform={`scale(${BTN_R * 1.1 / 24}) translate(-12,-12)`}
              fill="none" stroke={isMirrored ? '#fff' : 'rgba(0,0,0,0.65)'} strokeWidth={2.2}
              strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
              <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
              <line x1="12" y1="3" x2="12" y2="21" />
            </g>
          </g>
        )}
      </g>
    </g>
  );
});
