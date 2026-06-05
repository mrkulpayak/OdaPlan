import { memo } from 'react';
import { cmToPx, pxToCm } from '../../lib/geometry';
import { useUiStore } from '../../store/uiStore';
import { usePlanStore } from '../../store/planStore';
import type { Door as DoorType, Point } from '../../types';

interface Props {
  door: DoorType;
  wallStart: Point;
  wallEnd: Point;
  onSelect: (id: string) => void;
}

export const Door = memo(function Door({ door, wallStart, wallEnd, onSelect }: Props) {
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const isSelected = selectedItemId === door.id;

  // Wall vector and length
  const wdx = wallEnd.x - wallStart.x;
  const wdy = wallEnd.y - wallStart.y;
  const wallLen = Math.hypot(wdx, wdy);
  if (wallLen === 0) return null;

  const ux = wdx / wallLen; // unit vector along wall
  const uy = wdy / wallLen;
  // Inward normal (rotated 90° CCW = interior side)
  const nx = -uy;
  const ny = ux;

  const halfDoor = door.widthCm / 2;
  const centerT = door.positionOnWall * wallLen;

  // Door gap endpoints in cm
  const gapStartCm = centerT - halfDoor;
  const gapEndCm = centerT + halfDoor;

  // Convert to SVG pixels
  const sx = cmToPx(wallStart.x);
  const sy = cmToPx(wallStart.y);
  const scale = cmToPx(1);

  const gapStartPx = { x: sx + gapStartCm * ux * scale, y: sy + gapStartCm * uy * scale };
  const gapEndPx = { x: sx + gapEndCm * ux * scale, y: sy + gapEndCm * uy * scale };
  const doorWidthPx = door.widthCm * scale;

  // Hinge point and swing arc
  const hingePoint = door.hingeSide === 'left' ? gapStartPx : gapEndPx;
  const swingTipBase = door.hingeSide === 'left' ? gapEndPx : gapStartPx;

  const swingDir = door.opensTo === 'inside' ? 1 : -1;

  const swingTipX = hingePoint.x + swingDir * nx * doorWidthPx;
  const swingTipY = hingePoint.y + swingDir * ny * doorWidthPx;

  // Sweep flag: yay menteşe merkezinden doğru yönde çizilmeli (çeyrek daire)
  // Çapraz çarpım analizi: left+inside=1, left+outside=0, right+inside=0, right+outside=1
  const sweepFlag = door.hingeSide === 'left'
    ? (door.opensTo === 'inside' ? 1 : 0)
    : (door.opensTo === 'inside' ? 0 : 1);

  const arcPath = `M ${swingTipBase.x} ${swingTipBase.y} A ${doorWidthPx} ${doorWidthPx} 0 0 ${sweepFlag} ${swingTipX} ${swingTipY}`;

  // Handle click/drag: select + drag along wall
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect(door.id);

    const updateDoor = usePlanStore.getState().updateDoor;
    const minT = halfDoor / wallLen;
    const maxT = 1 - halfDoor / wallLen;

    const onMove = (ev: PointerEvent) => {
      const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
      if (!canvasSvg) return;
      const { canvas } = usePlanStore.getState();
      const r = canvasSvg.getBoundingClientRect();
      const cmX = pxToCm((ev.clientX - r.left - canvas.panX) / canvas.zoom);
      const cmY = pxToCm((ev.clientY - r.top - canvas.panY) / canvas.zoom);
      // Project pointer onto wall, clamp so door stays within wall bounds
      const t = Math.max(minT, Math.min(maxT,
        ((cmX - wallStart.x) * wdx + (cmY - wallStart.y) * wdy) / (wallLen * wallLen)
      ));
      updateDoor(door.id, { positionOnWall: t });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <g style={{ cursor: 'pointer' }}>
      {/* Wide transparent hit area for easy selection and drag */}
      <line
        x1={gapStartPx.x} y1={gapStartPx.y}
        x2={gapEndPx.x} y2={gapEndPx.y}
        stroke="transparent"
        strokeWidth={20}
        onPointerDown={handlePointerDown}
      />

      {/* Door slab line */}
      <line
        x1={hingePoint.x} y1={hingePoint.y}
        x2={swingTipX} y2={swingTipY}
        stroke="var(--color-room-outline)"
        strokeWidth={1.5}
        style={{ pointerEvents: 'none' }}
      />

      {/* Swing arc */}
      <path
        d={arcPath}
        fill="none"
        stroke="var(--color-secondary, #5E8FB5)"
        strokeWidth={1}
        strokeDasharray="4 3"
        style={{ pointerEvents: 'none' }}
      />

      {/* Selection highlight */}
      {isSelected && (
        <line
          x1={gapStartPx.x} y1={gapStartPx.y}
          x2={gapEndPx.x} y2={gapEndPx.y}
          stroke="var(--color-primary)"
          strokeWidth={3}
          strokeOpacity={0.4}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
});
