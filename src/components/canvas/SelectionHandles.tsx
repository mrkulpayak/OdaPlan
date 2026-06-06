import { memo, useRef, useState, useCallback } from 'react';
import { cmToPx } from '../../lib/geometry';
import { RadialRotateMenu, RADIAL_R0 } from './RadialRotateMenu';
import type { FurnitureFrontSide } from '../../types';

interface Props {
  widthCm: number;
  depthCm: number;
  /** Current rotation in degrees — needed to counter-rotate the overlay */
  rotation: number;
  zoom: number;
  /** Which side is the "front" — used to draw the front-face indicator line during rotation */
  frontSide?: FurnitureFrontSide;
  onStartMoveDrag: (e: React.PointerEvent) => void;
  onRotate90: () => void;
  onRotateToAngle: (angle: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

const HOLD_MS = 350;   // ms before radial menu opens

export const SelectionHandles = memo(function SelectionHandles({
  widthCm, depthCm, rotation, zoom, frontSide = 'bottom',
  onStartMoveDrag, onRotate90, onRotateToAngle, onDelete, onDuplicate,
}: Props) {
  const w = cmToPx(widthCm);
  const d = cmToPx(depthCm);
  const cx = w / 2;
  const cy = d / 2;

  const BTN_R   = (RADIAL_R0 * 0.55) / zoom;
  const BTN_GAP = BTN_R * 2 + 6 / zoom;

  // ── Radial menu state ──────────────────────────────────────────
  const [radialActive, setRadialActive] = useState(false);
  const [radialAngle,  setRadialAngle]  = useState(rotation);
  const holdTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalAngle = useRef(rotation);
  const didHoldRef    = useRef(false);

  const openRadial = useCallback(() => {
    originalAngle.current = rotation;
    setRadialAngle(rotation);
    setRadialActive(true);
    didHoldRef.current = true;
  }, [rotation]);

  const handleRotatePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    didHoldRef.current = false;
    holdTimerRef.current = setTimeout(openRadial, HOLD_MS);
  };

  const handleRotatePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    // Short tap — not a hold → 90° snap rotate
    if (!didHoldRef.current) {
      onRotate90();
    }
    // If hold: RadialRotateMenu handles confirm/cancel via global pointerup
  };

  const handleRadialAngleChange = useCallback((snapped: number) => {
    setRadialAngle(snapped);
    onRotateToAngle(snapped);
  }, [onRotateToAngle]);

  const handleRadialConfirm = useCallback(() => {
    setRadialActive(false);
  }, []);

  const handleRadialCancel = useCallback(() => {
    onRotateToAngle(originalAngle.current);
    setRadialActive(false);
  }, [onRotateToAngle]);

  // ── Delete / duplicate ────────────────────────────────────────
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

      {/*
        Counter-rotate group so buttons always appear upright.
      */}
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
          {(() => {
            const ir  = BTN_R * 0.46;
            const sw2 = Math.max(0.8, BTN_R * 0.13);
            const col = 'rgba(0,0,0,0.65)';
            const sx = ir, sy = 0;
            const ex = 0,  ey = -ir;
            const ms = BTN_R * 0.36;
            const markerId = `rot-arr-${widthCm}-${depthCm}`;
            return (
              <>
                <defs>
                  <marker
                    id={markerId}
                    markerWidth={ms} markerHeight={ms}
                    refX={ms * 0.75} refY={ms * 0.5}
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path
                      d={`M 0 ${ms * 0.08} L ${ms * 0.75} ${ms * 0.5} L 0 ${ms * 0.92}`}
                      fill="none" stroke={col} strokeWidth={sw2}
                      strokeLinecap="round" strokeLinejoin="round"
                    />
                  </marker>
                </defs>
                <path
                  d={`M ${sx} ${sy} A ${ir} ${ir} 0 1 1 ${ex} ${ey}`}
                  fill="none" stroke={col} strokeWidth={sw2} strokeLinecap="round"
                  markerEnd={`url(#${markerId})`}
                />
              </>
            );
          })()}
        </g>

        {/* ── Delete button (right of center) ── */}
        <g
          transform={`translate(${cx + BTN_GAP}, ${cy})`}
          style={{ cursor: 'pointer' }}
          onPointerDown={handleDelete}
          role="button"
          aria-label="Sil"
        >
          <circle r={BTN_R} fill="rgba(255,255,255,0.88)" stroke="rgba(0,0,0,0.18)" strokeWidth={BTN_R * 0.06} />
          <line x1={-BTN_R * 0.38} y1={-BTN_R * 0.38} x2={BTN_R * 0.38} y2={BTN_R * 0.38}
            stroke="rgba(0,0,0,0.65)" strokeWidth={BTN_R * 0.13} strokeLinecap="round" />
          <line x1={BTN_R * 0.38}  y1={-BTN_R * 0.38} x2={-BTN_R * 0.38} y2={BTN_R * 0.38}
            stroke="rgba(0,0,0,0.65)" strokeWidth={BTN_R * 0.13} strokeLinecap="round" />
        </g>

        {/* ── Duplicate button (left of center) ── */}
        <g
          transform={`translate(${cx - BTN_GAP}, ${cy})`}
          style={{ cursor: 'pointer' }}
          onPointerDown={handleDuplicate}
          role="button"
          aria-label="Kopyala"
        >
          <circle r={BTN_R} fill="rgba(255,255,255,0.88)" stroke="rgba(0,0,0,0.18)" strokeWidth={BTN_R * 0.06} />
          <rect x={-BTN_R * 0.38} y={-BTN_R * 0.38} width={BTN_R * 0.52} height={BTN_R * 0.52} rx={BTN_R * 0.07}
            fill="rgba(255,255,255,0.7)" stroke="rgba(0,0,0,0.65)" strokeWidth={BTN_R * 0.1} />
          <rect x={-BTN_R * 0.14} y={-BTN_R * 0.14} width={BTN_R * 0.52} height={BTN_R * 0.52} rx={BTN_R * 0.07}
            fill="rgba(255,255,255,0.88)" stroke="rgba(0,0,0,0.65)" strokeWidth={BTN_R * 0.1} />
        </g>
      </g>

      {/* ── Radial rotation menu ── */}
      {radialActive && (
        <g transform={`rotate(${-rotation}, ${cx}, ${cy})`}>
          <RadialRotateMenu
            cx={cx}
            cy={cy}
            currentAngle={radialAngle}
            originalAngle={originalAngle.current}
            frontSide={frontSide}
            zoom={zoom}
            onAngleChange={handleRadialAngleChange}
            onConfirm={handleRadialConfirm}
            onCancel={handleRadialCancel}
          />
        </g>
      )}
    </g>
  );
});
