import { memo } from 'react';
import { cmToPx, pxToCm, distancePointToSegment, segmentLength } from '../../lib/geometry';
import { useUiStore } from '../../store/uiStore';
import { usePlanStore } from '../../store/planStore';
import type { Window as WindowType, Point } from '../../types';
import { WallSegmentLabels } from './WallSegmentLabels';

function findNearestWallForItem(cmX: number, cmY: number, halfWidthCm: number) {
  const { room } = usePlanStore.getState();
  if (!room) return null;
  let best: { wallId: string; t: number; dist: number } | null = null;
  for (const wall of room.walls) {
    const a = room.points[wall.startPointIndex];
    const b = room.points[wall.endPointIndex];
    const len = segmentLength(a, b);
    if (len === 0) continue;
    const dist = distancePointToSegment({ x: cmX, y: cmY }, a, b);
    const dx = b.x - a.x, dy = b.y - a.y;
    const minT = halfWidthCm / len;
    const maxT = 1 - halfWidthCm / len;
    const rawT = ((cmX - a.x) * dx + (cmY - a.y) * dy) / (len * len);
    const t = Math.max(minT, Math.min(maxT, rawT));
    if (!best || dist < best.dist) best = { wallId: wall.id, t, dist };
  }
  return best;
}

// ── Window component ──────────────────────────────────────────────────────────

interface Props {
  window: WindowType;
  wallStart: Point;
  wallEnd: Point;
  onSelect: (id: string) => void;
}

export const WindowComp = memo(function WindowComp({ window, wallStart, wallEnd, onSelect }: Props) {
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const isSelected = selectedItemId === window.id;

  const wdx = wallEnd.x - wallStart.x;
  const wdy = wallEnd.y - wallStart.y;
  const wallLen = Math.hypot(wdx, wdy);
  if (wallLen === 0) return null;

  const ux = wdx / wallLen;
  const uy = wdy / wallLen;
  const nx = -uy;
  const ny = ux;

  const halfWin = window.widthCm / 2;
  const centerT = window.positionOnWall * wallLen;

  const scale = cmToPx(1);
  const sx = cmToPx(wallStart.x);
  const sy = cmToPx(wallStart.y);

  const winStartCm = centerT - halfWin;
  const winEndCm   = centerT + halfWin;

  const s1x = sx + winStartCm * ux * scale;
  const s1y = sy + winStartCm * uy * scale;
  const s2x = sx + winEndCm   * ux * scale;
  const s2y = sy + winEndCm   * uy * scale;

  // Triple-line symbol offsets
  const offset = 3;
  const o1x = nx * offset;
  const o1y = ny * offset;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect(window.id);

    const updateWindow = usePlanStore.getState().updateWindow;

    const onMove = (ev: PointerEvent) => {
      const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
      if (!canvasSvg) return;
      const { canvas } = usePlanStore.getState();
      const r = canvasSvg.getBoundingClientRect();
      const cmX = pxToCm((ev.clientX - r.left - canvas.panX) / canvas.zoom);
      const cmY = pxToCm((ev.clientY - r.top - canvas.panY) / canvas.zoom);
      const nearest = findNearestWallForItem(cmX, cmY, halfWin);
      if (nearest) updateWindow(window.id, { wallId: nearest.wallId, positionOnWall: nearest.t });
    };

    const onUp = () => {
      globalThis.removeEventListener('pointermove', onMove);
      globalThis.removeEventListener('pointerup', onUp);
    };

    globalThis.addEventListener('pointermove', onMove);
    globalThis.addEventListener('pointerup', onUp);
  };

  const zoom = usePlanStore.getState().canvas.zoom;

  return (
    <g style={{ cursor: 'pointer' }}>
      {/* Wide transparent hit area */}
      <line
        x1={s1x} y1={s1y} x2={s2x} y2={s2y}
        stroke="transparent"
        strokeWidth={20}
        onPointerDown={handlePointerDown}
      />

      {/* Outer line 1 (wall plane) */}
      <line x1={s1x} y1={s1y} x2={s2x} y2={s2y} stroke="var(--color-room-outline)" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
      {/* Center line (offset inward) */}
      <line x1={s1x + o1x} y1={s1y + o1y} x2={s2x + o1x} y2={s2y + o1y} stroke="var(--color-room-outline)" strokeWidth={1} style={{ pointerEvents: 'none' }} />
      {/* Outer line 2 */}
      <line x1={s1x + o1x * 2} y1={s1y + o1y * 2} x2={s2x + o1x * 2} y2={s2y + o1y * 2} stroke="var(--color-room-outline)" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />

      {isSelected && (
        <line x1={s1x} y1={s1y} x2={s2x} y2={s2y} stroke="var(--color-primary)" strokeWidth={4} strokeOpacity={0.3} style={{ pointerEvents: 'none' }} />
      )}

      {/* All wall segment labels */}
      {isSelected && (
        <WallSegmentLabels
          wallId={window.wallId}
          wallStart={wallStart}
          wallEnd={wallEnd}
          zoom={zoom}
        />
      )}
    </g>
  );
});
