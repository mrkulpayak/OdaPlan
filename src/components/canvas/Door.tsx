import { memo } from 'react';
import { cmToPx, pxToCm, distancePointToSegment, segmentLength } from '../../lib/geometry';
import { useUiStore } from '../../store/uiStore';
import { usePlanStore } from '../../store/planStore';
import type { Door as DoorType, Point } from '../../types';
import { WallSegmentLabels } from './WallSegmentLabels';
import { collectWallItemEdges, snapToWallItemEdges, collectWallObstacleRanges, clampAwayFromRanges } from '../../hooks/useSnap';
import { SNAP_DISTANCE_CM, WALL_BAND_CM } from '../../lib/constants';
import { isWallEndpointConvex } from '../../lib/geometry';

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

// ── Door component ────────────────────────────────────────────────────────────

interface Props {
  door: DoorType;
  wallStart: Point;
  wallEnd: Point;
  onSelect: (id: string) => void;
}

export const Door = memo(function Door({ door, wallStart, wallEnd, onSelect }: Props) {
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const isSelected = selectedItemId === door.id;

  const wdx = wallEnd.x - wallStart.x;
  const wdy = wallEnd.y - wallStart.y;
  const wallLen = Math.hypot(wdx, wdy);
  if (wallLen === 0) return null;

  const ux = wdx / wallLen;
  const uy = wdy / wallLen;
  const nx = -uy;
  const ny = ux;

  const halfDoor = door.widthCm / 2;
  const centerT = door.positionOnWall * wallLen;

  const gapStartCm = centerT - halfDoor;
  const gapEndCm = centerT + halfDoor;

  const sx = cmToPx(wallStart.x);
  const sy = cmToPx(wallStart.y);
  const scale = cmToPx(1);

  const gapStartPx = { x: sx + gapStartCm * ux * scale, y: sy + gapStartCm * uy * scale };
  const gapEndPx   = { x: sx + gapEndCm   * ux * scale, y: sy + gapEndCm   * uy * scale };
  const doorWidthPx = door.widthCm * scale;

  const hingePoint    = door.hingeSide === 'left' ? gapStartPx : gapEndPx;
  const swingTipBase  = door.hingeSide === 'left' ? gapEndPx   : gapStartPx;

  const swingDir = door.opensTo === 'inside' ? 1 : -1;
  const swingTipX = hingePoint.x + swingDir * nx * doorWidthPx;
  const swingTipY = hingePoint.y + swingDir * ny * doorWidthPx;

  const sweepFlag = door.hingeSide === 'left'
    ? (door.opensTo === 'inside' ? 1 : 0)
    : (door.opensTo === 'inside' ? 0 : 1);

  const arcPath = `M ${swingTipBase.x} ${swingTipBase.y} A ${doorWidthPx} ${doorWidthPx} 0 0 ${sweepFlag} ${swingTipX} ${swingTipY}`;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect(door.id);

    const updateDoor = usePlanStore.getState().updateDoor;

    const onMove = (ev: PointerEvent) => {
      const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
      if (!canvasSvg) return;
      const { canvas } = usePlanStore.getState();
      const r = canvasSvg.getBoundingClientRect();
      const cmX = pxToCm((ev.clientX - r.left - canvas.panX) / canvas.zoom);
      const cmY = pxToCm((ev.clientY - r.top - canvas.panY) / canvas.zoom);
      const nearest = findNearestWallForItem(cmX, cmY, halfDoor);
      if (nearest) {
        const { room } = usePlanStore.getState();
        let t = nearest.t;
        if (room && usePlanStore.getState().canvas.snapEnabled !== false) {
          const wall = room.walls.find(w => w.id === nearest.wallId);
          if (wall) {
            const wA = room.points[wall.startPointIndex];
            const wB = room.points[wall.endPointIndex];
            const wallLen = Math.hypot(wB.x - wA.x, wB.y - wA.y);
            const edges = collectWallItemEdges(nearest.wallId, wA.x, wA.y, wB.x, wB.y, door.id, room);
            const delta = snapToWallItemEdges(t * wallLen, halfDoor, SNAP_DISTANCE_CM / 2, edges);
            let tCm = t * wallLen + delta;
            // Clamp away from columns
            const colRanges = collectWallObstacleRanges(nearest.wallId, wA.x, wA.y, wB.x, wB.y, door.id, room);
            tCm = clampAwayFromRanges(tCm, halfDoor, wallLen, colRanges);
            // Convex-only wall-band margin
            const startMargin = isWallEndpointConvex(room, wall, false) ? WALL_BAND_CM : 0;
            const endMargin   = isWallEndpointConvex(room, wall, true)  ? WALL_BAND_CM : 0;
            t = Math.max((halfDoor + startMargin) / wallLen, Math.min(1 - (halfDoor + endMargin) / wallLen, tCm / wallLen));
          }
        }
        updateDoor(door.id, { wallId: nearest.wallId, positionOnWall: t, hingeSide: t < 0.5 ? 'left' : 'right' });
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const zoom = usePlanStore.getState().canvas.zoom;

  return (
    <g style={{ cursor: 'pointer' }}>
      {/* Wide transparent hit area */}
      <line
        x1={gapStartPx.x} y1={gapStartPx.y}
        x2={gapEndPx.x}   y2={gapEndPx.y}
        stroke="transparent"
        strokeWidth={20}
        onPointerDown={handlePointerDown}
      />

      {/* Door slab */}
      <line
        x1={hingePoint.x} y1={hingePoint.y}
        x2={swingTipX}    y2={swingTipY}
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
          x2={gapEndPx.x}   y2={gapEndPx.y}
          stroke="var(--color-primary)"
          strokeWidth={3}
          strokeOpacity={0.4}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* All wall segment labels */}
      {isSelected && (
        <WallSegmentLabels
          wallId={door.wallId}
          wallStart={wallStart}
          wallEnd={wallEnd}
          zoom={zoom}
        />
      )}
    </g>
  );
});
