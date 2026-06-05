import { memo } from 'react';
import type { Wall as WallType, Point, Door as DoorType, Window as WindowType } from '../../types';
import { cmToPx, segmentLength } from '../../lib/geometry';
import { DimensionLabel } from './DimensionLabel';
import { Door } from './Door';
import { WindowComp } from './Window';

interface Props {
  wall: WallType;
  points: Point[];
  doors: DoorType[];
  windows: WindowType[];
  viewRotation: number;
  zoom: number;
  isSelected: boolean;
  onCommitLength: (wallId: string, newLengthCm: number) => void;
  onToggleLock: (wallId: string) => void;
  onTogglePin: (wallId: string) => void;
  onSelectDoor: (id: string) => void;
  onSelectWindow: (id: string) => void;
  onWallClick: (wallId: string, e: React.PointerEvent) => void;
}

export const Wall = memo(function Wall({
  wall, points, doors, windows, viewRotation, zoom, isSelected,
  onCommitLength, onToggleLock, onTogglePin, onSelectDoor, onSelectWindow, onWallClick,
}: Props) {
  const aCm = points[wall.startPointIndex];
  const bCm = points[wall.endPointIndex];

  const aPx = { x: cmToPx(aCm.x), y: cmToPx(aCm.y) };
  const bPx = { x: cmToPx(bCm.x), y: cmToPx(bCm.y) };
  const lengthCm = segmentLength(aCm, bCm);

  // Compute gaps in wall line for doors and windows
  // Each gap: [t_start, t_end] as 0-1 normalized along wall
  const gaps: Array<[number, number]> = [];

  for (const door of doors) {
    const half = door.widthCm / (2 * lengthCm);
    gaps.push([door.positionOnWall - half, door.positionOnWall + half]);
  }
  for (const win of windows) {
    const half = win.widthCm / (2 * lengthCm);
    gaps.push([win.positionOnWall - half, win.positionOnWall + half]);
  }

  // Sort gaps and build wall segments
  gaps.sort((a, b) => a[0] - b[0]);

  const wallSegments: Array<[number, number]> = [];
  let cur = 0;
  for (const [gs, ge] of gaps) {
    const s = Math.max(0, gs);
    const e = Math.min(1, ge);
    if (s > cur) wallSegments.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (cur < 1) wallSegments.push([cur, 1]);

  const dx = bPx.x - aPx.x;
  const dy = bPx.y - aPx.y;

  const wallLines = gaps.length === 0
    ? [{ x1: aPx.x, y1: aPx.y, x2: bPx.x, y2: bPx.y }]
    : wallSegments.map(([t1, t2]) => ({
        x1: aPx.x + t1 * dx, y1: aPx.y + t1 * dy,
        x2: aPx.x + t2 * dx, y2: aPx.y + t2 * dy,
      }));

  return (
    <g>
      {/* Invisible wide hit area for wall click */}
      <line
        x1={aPx.x} y1={aPx.y} x2={bPx.x} y2={bPx.y}
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: 'pointer' }}
        onPointerDown={(e) => { e.stopPropagation(); onWallClick(wall.id, e); }}
      />
      {wallLines.map((seg, i) => (
        <line
          key={i}
          x1={seg.x1} y1={seg.y1}
          x2={seg.x2} y2={seg.y2}
          stroke={
            wall.isPinned
              ? '#ef4444'
              : isSelected
                ? 'var(--color-primary)'
                : 'var(--color-room-outline)'
          }
          strokeWidth={wall.isPinned ? 2.5 : isSelected ? 2.5 : 1.5}
          strokeLinecap="round"
          style={{ pointerEvents: 'none' }}
        />
      ))}

      {doors.map((door) => (
        <Door key={door.id} door={door} wallStart={aCm} wallEnd={bCm} onSelect={onSelectDoor} />
      ))}

      {windows.map((win) => (
        <WindowComp key={win.id} window={win} wallStart={aCm} wallEnd={bCm} onSelect={onSelectWindow} />
      ))}

      <DimensionLabel
        wallId={wall.id}
        a={aPx}
        b={bPx}
        lengthCm={lengthCm}
        isLocked={wall.isLengthLocked}
        isPinned={wall.isPinned}
        onCommit={onCommitLength}
        onToggleLock={onToggleLock}
        onTogglePin={onTogglePin}
        viewRotation={viewRotation}
        zoom={zoom}
      />
    </g>
  );
});
