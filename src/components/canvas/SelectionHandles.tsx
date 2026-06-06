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

        {/* ── Rotate button (center) — RotateCw (lucide) ── */}
        <g
          transform={`translate(${cx}, ${cy})`}
          style={{ cursor: 'pointer' }}
          onPointerDown={handleRotatePointerDown}
          onPointerUp={handleRotatePointerUp}
          role="button"
          aria-label="Döndür"
        >
          <circle r={BTN_R} fill="rgba(255,255,255,0.88)" stroke="rgba(0,0,0,0.18)" strokeWidth={BTN_R * 0.06} />
          {/* lucide RotateCw — 24×24 viewBox scaled to fit circle */}
          <g transform={`scale(${BTN_R * 1.1 / 24}) translate(-12,-12)`}
            fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </g>
        </g>

        {/* ── Delete button (right of center) — Trash2 (lucide) ── */}
        <g
          transform={`translate(${cx + BTN_GAP}, ${cy})`}
          style={{ cursor: 'pointer' }}
          onPointerDown={handleDelete}
          role="button"
          aria-label="Sil"
        >
          <circle r={BTN_R} fill="rgba(255,255,255,0.88)" stroke="rgba(0,0,0,0.18)" strokeWidth={BTN_R * 0.06} />
          {/* lucide Trash2 — 24×24 viewBox scaled to fit circle */}
          <g transform={`scale(${BTN_R * 1.1 / 24}) translate(-12,-12)`}
            fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </g>
        </g>

        {/* ── Duplicate button (left of center) — Copy (lucide) ── */}
        <g
          transform={`translate(${cx - BTN_GAP}, ${cy})`}
          style={{ cursor: 'pointer' }}
          onPointerDown={handleDuplicate}
          role="button"
          aria-label="Kopyala"
        >
          <circle r={BTN_R} fill="rgba(255,255,255,0.88)" stroke="rgba(0,0,0,0.18)" strokeWidth={BTN_R * 0.06} />
          {/* lucide Copy — 24×24 viewBox scaled to fit circle */}
          <g transform={`scale(${BTN_R * 1.1 / 24}) translate(-12,-12)`}
            fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </g>
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
