import { memo } from 'react';
import { cmToPx } from '../../lib/geometry';
import { useUiStore } from '../../store/uiStore';
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
  const nx = -uy; // inward normal
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

  return (
    <g
      onClick={(e) => { e.stopPropagation(); onSelect(window.id); }}
      style={{ cursor: 'pointer' }}
    >
      {/* Outer line 1 (wall plane) */}
      <line x1={s1x} y1={s1y} x2={s2x} y2={s2y} stroke="var(--color-room-outline)" strokeWidth={1.5} />
      {/* Center line (offset inward) */}
      <line x1={s1x + o1x} y1={s1y + o1y} x2={s2x + o1x} y2={s2y + o1y} stroke="var(--color-room-outline)" strokeWidth={1} />
      {/* Outer line 2 */}
      <line x1={s1x + o1x * 2} y1={s1y + o1y * 2} x2={s2x + o1x * 2} y2={s2y + o1y * 2} stroke="var(--color-room-outline)" strokeWidth={1.5} />

      {isSelected && (
        <line x1={s1x} y1={s1y} x2={s2x} y2={s2y} stroke="var(--color-primary)" strokeWidth={4} strokeOpacity={0.3} />
      )}
    </g>
  );
});
