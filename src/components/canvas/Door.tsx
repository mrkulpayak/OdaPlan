import { memo } from 'react';
import { cmToPx } from '../../lib/geometry';
import { useUiStore } from '../../store/uiStore';
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
  const centerT = door.positionOnWall * wallLen; // position in cm along wall

  // Door gap endpoints in cm
  const gapStartCm = centerT - halfDoor;
  const gapEndCm = centerT + halfDoor;

  // Convert to SVG pixels
  const sx = cmToPx(wallStart.x);
  const sy = cmToPx(wallStart.y);
  const scale = cmToPx(1); // = CM_TO_PX

  const gapStartPx = { x: sx + gapStartCm * ux * scale, y: sy + gapStartCm * uy * scale };
  const gapEndPx = { x: sx + gapEndCm * ux * scale, y: sy + gapEndCm * uy * scale };
  const doorWidthPx = door.widthCm * scale;

  // Hinge point and swing arc
  // hingeSide: 'left' = hinge at gapStart (along wall direction), 'right' = at gapEnd
  const hingePoint = door.hingeSide === 'left' ? gapStartPx : gapEndPx;
  const swingTipBase = door.hingeSide === 'left' ? gapEndPx : gapStartPx;

  // Swing direction: opensTo 'inside' = swing toward interior (positive normal direction)
  // opensTo 'outside' = swing toward exterior (negative normal direction)
  const swingDir = door.opensTo === 'inside' ? 1 : -1;

  // The door slab tip swings perpendicular to wall
  const swingTipX = hingePoint.x + swingDir * nx * doorWidthPx;
  const swingTipY = hingePoint.y + swingDir * ny * doorWidthPx;

  // Arc: from swingTipBase to swingTip, radius = doorWidthPx
  // large-arc-flag = 0 (always quarter arc), sweep based on direction
  const sweepFlag = door.hingeSide === 'left'
    ? (door.opensTo === 'inside' ? 0 : 1)
    : (door.opensTo === 'inside' ? 1 : 0);

  const arcPath = `M ${swingTipBase.x} ${swingTipBase.y} A ${doorWidthPx} ${doorWidthPx} 0 0 ${sweepFlag} ${swingTipX} ${swingTipY}`;

  return (
    <g
      onClick={(e) => { e.stopPropagation(); onSelect(door.id); }}
      style={{ cursor: 'pointer' }}
    >
      {/* Door slab line */}
      <line
        x1={hingePoint.x} y1={hingePoint.y}
        x2={swingTipX} y2={swingTipY}
        stroke="var(--color-room-outline)"
        strokeWidth={1.5}
      />

      {/* Swing arc */}
      <path
        d={arcPath}
        fill="none"
        stroke="var(--color-secondary, #5E8FB5)"
        strokeWidth={1}
        strokeDasharray="4 3"
      />

      {/* Selection highlight */}
      {isSelected && (
        <line
          x1={gapStartPx.x} y1={gapStartPx.y}
          x2={gapEndPx.x} y2={gapEndPx.y}
          stroke="var(--color-primary)"
          strokeWidth={3}
          strokeOpacity={0.4}
        />
      )}
    </g>
  );
});
