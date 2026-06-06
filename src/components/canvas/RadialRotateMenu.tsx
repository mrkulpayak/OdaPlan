import { useEffect, useState } from 'react';

import type { FurnitureFrontSide } from '../../types';

/** Screen-angle offset so the indicator line points toward the front face.
 *  At rotation=0: bottom→90°, top→270°, left→180°, right→0° in SVG polar space. */
const FACE_ANGLE_OFFSET: Record<FurnitureFrontSide, number> = {
  bottom: 90,
  top:    270,
  left:   180,
  right:  0,
};

interface Props {
  cx: number;
  cy: number;
  currentAngle: number;
  /** Angle when radial menu was first opened — used to show delta */
  originalAngle: number;
  /** Which face is the front — indicator line points toward this face */
  frontSide?: FurnitureFrontSide;
  zoom: number;
  onAngleChange: (snappedAngle: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Screen-pixel radii */
export const RADIAL_R0 = 55;   // dead-zone
const R1 = 100;                 // 90° → 45° boundary
const R2 = 148;                 // 45° → 5° boundary
const R3 = 196;                 // outer display edge

type Zone = 0 | 1 | 2 | 3 | 4; // 0=dead, 1=90°, 2=45°, 3=5°, 4=outside(1°)

function getZone(distPx: number): Zone {
  if (distPx < RADIAL_R0) return 0;
  if (distPx < R1)         return 1;
  if (distPx < R2)         return 2;
  if (distPx < R3)         return 3;
  return 4;
}

function stepForZone(zone: Zone): number | null {
  if (zone === 0) return null;
  if (zone === 1) return 90;
  if (zone === 2) return 45;
  if (zone === 3) return 5;
  return 1; // zone 4 — outside all rings
}

function snapTo(angleDeg: number, step: number): number {
  return Math.round(angleDeg / step) * step;
}

/** Pre-computed tick sets */
const TICKS_90  = Array.from({ length: 4  }, (_, i) => i * 90);
const TICKS_45  = Array.from({ length: 8  }, (_, i) => i * 45).filter(a => a % 90 !== 0);
const TICKS_5   = Array.from({ length: 72 }, (_, i) => i * 5 ).filter(a => a % 45 !== 0);

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r };
}

/** Highlight color for the active zone ring */
const ZONE_HIGHLIGHT = 'rgba(59,130,246,0.12)'; // subtle blue tint

export function RadialRotateMenu({
  cx, cy, currentAngle, originalAngle, frontSide = 'bottom', zoom,
  onAngleChange, onConfirm, onCancel,
}: Props) {
  const r0 = RADIAL_R0 / zoom;
  const r1 = R1 / zoom;
  const r2 = R2 / zoom;
  const r3 = R3 / zoom;

  const [activeZone, setActiveZone] = useState<Zone>(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = document.getElementById('radial-menu-center');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const screenCx = rect.left + rect.width / 2;
      const screenCy = rect.top + rect.height / 2;
      const dx = e.clientX - screenCx;
      const dy = e.clientY - screenCy;
      const dist = Math.hypot(dx, dy);
      const zone = getZone(dist);
      setActiveZone(zone);

      const step = stepForZone(zone);
      if (step === null) return;
      const snapped = ((snapTo(Math.atan2(dy, dx) * (180 / Math.PI), step) % 360) + 360) % 360;
      onAngleChange(snapped);
    };

    const onUp  = () => onConfirm();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [zoom, onAngleChange, onConfirm, onCancel]);

  // Angle indicator line — points toward the front face of the furniture
  const faceAngle = (currentAngle + FACE_ANGLE_OFFSET[frontSide]) % 360;
  const tip = polarToXY(cx, cy, r3 + 4 / zoom, faceAngle);
  const fs  = Math.max(8, 10 / zoom);

  // Delta rotation (normalized to -180..180)
  const raw   = currentAngle - originalAngle;
  const delta = ((raw + 180) % 360) - 180;
  const sign  = delta >= 0 ? '+' : '';

  const sw = 0.8 / zoom;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* ── Outer white disc ── */}
      <circle cx={cx} cy={cy} r={r3} fill="white" stroke="rgba(0,0,0,0.15)" strokeWidth={sw} />

      {/* ── Zone highlight fills (shown when pointer is in that zone) ── */}
      {/* Zone 3 fill: r2 → r3 (5°) */}
      {activeZone === 3 && (
        <path
          d={`M ${cx} ${cy} m ${r3} 0 A ${r3} ${r3} 0 1 0 ${cx - r3} ${cy} A ${r3} ${r3} 0 1 0 ${cx + r3} ${cy} Z
              M ${cx} ${cy} m ${r2} 0 A ${r2} ${r2} 0 1 1 ${cx - r2} ${cy} A ${r2} ${r2} 0 1 1 ${cx + r2} ${cy} Z`}
          fill={ZONE_HIGHLIGHT}
          fillRule="evenodd"
        />
      )}
      {/* Zone 2 fill: r1 → r2 (45°) */}
      {activeZone === 2 && (
        <path
          d={`M ${cx} ${cy} m ${r2} 0 A ${r2} ${r2} 0 1 0 ${cx - r2} ${cy} A ${r2} ${r2} 0 1 0 ${cx + r2} ${cy} Z
              M ${cx} ${cy} m ${r1} 0 A ${r1} ${r1} 0 1 1 ${cx - r1} ${cy} A ${r1} ${r1} 0 1 1 ${cx + r1} ${cy} Z`}
          fill={ZONE_HIGHLIGHT}
          fillRule="evenodd"
        />
      )}
      {/* Zone 1 fill: r0 → r1 (90°) */}
      {activeZone === 1 && (
        <path
          d={`M ${cx} ${cy} m ${r1} 0 A ${r1} ${r1} 0 1 0 ${cx - r1} ${cy} A ${r1} ${r1} 0 1 0 ${cx + r1} ${cy} Z
              M ${cx} ${cy} m ${r0} 0 A ${r0} ${r0} 0 1 1 ${cx - r0} ${cy} A ${r0} ${r0} 0 1 1 ${cx + r0} ${cy} Z`}
          fill={ZONE_HIGHLIGHT}
          fillRule="evenodd"
        />
      )}

      {/* ── 5° tick marks — outer ring (r2 → r3) ── */}
      {TICKS_5.map((a) => {
        const p1 = polarToXY(cx, cy, r2, a);
        const p2 = polarToXY(cx, cy, r3, a);
        return <line key={`t5-${a}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          stroke="rgba(0,0,0,0.18)" strokeWidth={0.5 / zoom} strokeLinecap="round" />;
      })}

      {/* ── Ring divider r2 ── */}
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={sw} />

      {/* ── 45° tick marks — mid ring (r1 → r3) ── */}
      {TICKS_45.map((a) => {
        const p1 = polarToXY(cx, cy, r1, a);
        const p2 = polarToXY(cx, cy, r3, a);
        return <line key={`t45-${a}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          stroke="rgba(0,0,0,0.32)" strokeWidth={0.9 / zoom} strokeLinecap="round" />;
      })}

      {/* ── Ring divider r1 ── */}
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={sw} />

      {/* ── 90° tick marks — spanning all rings (r0 → r3) ── */}
      {TICKS_90.map((a) => {
        const p1 = polarToXY(cx, cy, r0, a);
        const p2 = polarToXY(cx, cy, r3, a);
        return <line key={`t90-${a}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          stroke="rgba(0,0,0,0.52)" strokeWidth={1.4 / zoom} strokeLinecap="round" />;
      })}

      {/* ── Inner dead-zone disc ── */}
      <circle cx={cx} cy={cy} r={r0} fill="white" stroke="rgba(0,0,0,0.15)" strokeWidth={sw} />

      {/* ── Angle indicator line ── */}
      <line x1={cx} y1={cy} x2={tip.x} y2={tip.y}
        stroke="var(--color-primary)" strokeWidth={2 / zoom} strokeLinecap="round" />

      {/* ── Invisible anchor for getBoundingClientRect ── */}
      <circle id="radial-menu-center" cx={cx} cy={cy} r={r0 * 0.55}
        fill="var(--color-primary)" opacity={0.9} />

      {/* ── Delta readout (e.g. "+45°" or "-90°") ── */}
      <text x={cx} y={cy + fs * 0.4} textAnchor="middle"
        style={{ fontSize: fs * 1.05, fontFamily: 'var(--font-mono)', fill: '#fff', fontWeight: 700, pointerEvents: 'none' }}>
        {sign}{Math.round(delta)}°
      </text>
    </g>
  );
}
