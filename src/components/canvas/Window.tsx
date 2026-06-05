import { memo } from 'react';
import { cmToPx, pxToCm } from '../../lib/geometry';
import { useUiStore } from '../../store/uiStore';
import { usePlanStore } from '../../store/planStore';
import type { Window as WindowType, Point } from '../../types';

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

  const s1x = sx + (centerT - halfWin) * ux * scale;
  const s1y = sy + (centerT - halfWin) * uy * scale;
  const s2x = sx + (centerT + halfWin) * ux * scale;
  const s2y = sy + (centerT + halfWin) * uy * scale;

  // Triple line symbol: outer line (on wall), center line (3px offset inward), outer line
  const offset = 3;
  const o1x = nx * offset;
  const o1y = ny * offset;

  // Handle click/drag: select + drag along wall
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect(window.id);

    const updateWindow = usePlanStore.getState().updateWindow;
    const minT = halfWin / wallLen;
    const maxT = 1 - halfWin / wallLen;

    const onMove = (ev: PointerEvent) => {
      const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
      if (!canvasSvg) return;
      const { canvas } = usePlanStore.getState();
      const r = canvasSvg.getBoundingClientRect();
      const cmX = pxToCm((ev.clientX - r.left - canvas.panX) / canvas.zoom);
      const cmY = pxToCm((ev.clientY - r.top - canvas.panY) / canvas.zoom);
      const t = Math.max(minT, Math.min(maxT,
        ((cmX - wallStart.x) * wdx + (cmY - wallStart.y) * wdy) / (wallLen * wallLen)
      ));
      updateWindow(window.id, { positionOnWall: t });
    };

    const onUp = () => {
      globalThis.removeEventListener('pointermove', onMove);
      globalThis.removeEventListener('pointerup', onUp);
    };

    globalThis.addEventListener('pointermove', onMove);
    globalThis.addEventListener('pointerup', onUp);
  };

  return (
    <g style={{ cursor: 'pointer' }}>
      {/* Wide transparent hit area for easy selection and drag */}
      <line
        x1={s1x} y1={s1y}
        x2={s2x} y2={s2y}
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
    </g>
  );
});
