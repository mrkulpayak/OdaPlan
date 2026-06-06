import { memo, useState } from 'react';
import { cmToPx, pxToCm } from '../../lib/geometry';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { computeSnap } from '../../hooks/useSnap';
import { SNAP_DISTANCE_CM } from '../../lib/constants';
import type { Column, Room as RoomType, FurnitureCatalogItem } from '../../types';
import { WallSegmentLabels } from './WallSegmentLabels';
import type { Point } from '../../types';

// ── When corner snap fires (no snappedTo), detect if a face is flush with a wall ──
function detectWallFlush(
  pos: Point, wc: number, dc: number, rotation: number, room: RoomType
): { wallId: string; side: 'top' | 'right' | 'bottom' | 'left' } | undefined {
  const θ = (rotation * Math.PI) / 180;
  const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
  const cx = pos.x + wc / 2, cy = pos.y + dc / 2;

  const faces: { side: 'top' | 'right' | 'bottom' | 'left'; lx: number; ly: number }[] = [
    { side: 'top',    lx: 0,      ly: -dc / 2 },
    { side: 'bottom', lx: 0,      ly:  dc / 2 },
    { side: 'left',   lx: -wc / 2, ly: 0      },
    { side: 'right',  lx:  wc / 2, ly: 0      },
  ];

  let bestDist = 2; // cm tolerance
  let best: { wallId: string; side: 'top' | 'right' | 'bottom' | 'left' } | undefined;

  for (const { side, lx, ly } of faces) {
    const fx = cx + lx * cosθ - ly * sinθ;
    const fy = cy + lx * sinθ + ly * cosθ;

    for (const wall of room.walls) {
      const A = room.points[wall.startPointIndex];
      const B = room.points[wall.endPointIndex];
      const wLen = Math.hypot(B.x - A.x, B.y - A.y);
      if (wLen < 1) continue;
      const wux = (B.x - A.x) / wLen;
      const wuy = (B.y - A.y) / wLen;
      const dx = fx - A.x, dy = fy - A.y;
      const perpDist = Math.abs(-dx * wuy + dy * wux);
      const along = dx * wux + dy * wuy;
      if (perpDist < bestDist && along >= -2 && along <= wLen + 2) {
        bestDist = perpDist;
        best = { wallId: wall.id, side };
      }
    }
  }

  return best;
}

// ── Recompute position so snapped face stays on wall after dimension change ───
function adjustPosForDimChange(
  col: Column, newWc: number, newDc: number
): Point {
  if (!col.snappedToWall) return col.position;
  const { side } = col.snappedToWall;
  const θ = (col.rotation * Math.PI) / 180;
  const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
  const cx = col.position.x + col.widthCm / 2;
  const cy = col.position.y + col.depthCm / 2;

  // Current face midpoint (world coords)
  const [flx, fly] = side === 'top' ? [0, -col.depthCm / 2]
    : side === 'bottom' ? [0, col.depthCm / 2]
    : side === 'left' ? [-col.widthCm / 2, 0]
    : [col.widthCm / 2, 0];
  const faceMidX = cx + flx * cosθ - fly * sinθ;
  const faceMidY = cy + flx * sinθ + fly * cosθ;

  // New face offset with updated dimensions
  const [nflx, nfly] = side === 'top' ? [0, -newDc / 2]
    : side === 'bottom' ? [0, newDc / 2]
    : side === 'left' ? [-newWc / 2, 0]
    : [newWc / 2, 0];
  const newCx = faceMidX - (nflx * cosθ - nfly * sinθ);
  const newCy = faceMidY - (nflx * sinθ + nfly * cosθ);

  return { x: newCx - newWc / 2, y: newCy - newDc / 2 };
}

// ── Ray–segment intersection for free-floating labels ────────────────────────
function castRay(
  ox: number, oy: number,
  dx: number, dy: number,
  room: RoomType
): { dist: number; wx: number; wy: number } | null {
  let best: { t: number; wx: number; wy: number } | null = null;
  for (const wall of room.walls) {
    const A = room.points[wall.startPointIndex];
    const B = room.points[wall.endPointIndex];
    const ex = B.x - A.x, ey = B.y - A.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const s = ((A.x - ox) * dy - (A.y - oy) * dx) / denom;
    if (s < -0.001 || s > 1.001) continue;
    const t = ((A.x - ox) * ey - (A.y - oy) * ex) / denom;
    if (t < 0.1) continue;
    if (best === null || t < best.t) {
      best = { t, wx: ox + t * dx, wy: oy + t * dy };
    }
  }
  return best ? { dist: best.t, wx: best.wx, wy: best.wy } : null;
}

// ── Editable label (click to type a new cm value) ────────────────────────────
interface EditableLabelProps {
  midX: number; midY: number;
  distCm: number;
  zoom: number;
  onCommit: (d: number) => void;
}
function EditableLabel({ midX, midY, distCm, zoom, onCommit }: EditableLabelProps) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const fs = Math.max(8, Math.min(10, 9 / zoom));

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0) onCommit(n);
  };

  if (editing) {
    return (
      <foreignObject
        data-interactive="true"
        x={midX - 22 / zoom} y={midY - 9 / zoom}
        width={44 / zoom} height={18 / zoom}
        style={{ overflow: 'visible' }}
      >
        <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top left', width: '44px', height: '18px' }}>
          <input
            type="number" value={val} autoFocus
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { commit(val); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
            onBlur={() => { commit(val); setEditing(false); }}
            style={{ width: '100%', height: '100%', fontSize: '10px', fontFamily: 'var(--font-mono)', textAlign: 'center', border: '1px solid var(--color-primary)', borderRadius: '2px', outline: 'none', padding: '1px', background: 'var(--color-surface)', boxSizing: 'border-box' }}
          />
        </div>
      </foreignObject>
    );
  }
  return (
    <text data-interactive="true" x={midX} y={midY} textAnchor="middle" dominantBaseline="middle"
      style={{ fontFamily: 'var(--font-mono)', fontSize: `${fs}px`, fill: 'var(--color-primary)', cursor: 'text', userSelect: 'none' }}
      onClick={() => { setVal(String(Math.round(distCm))); setEditing(true); }}
    >{Math.round(distCm)}</text>
  );
}

// ── Free-floating dim label (line + ticks + editable text) ───────────────────
interface DimLabelProps {
  x1: number; y1: number; x2: number; y2: number;
  midX: number; midY: number;
  distCm: number; zoom: number;
  onCommit: (d: number) => void;
}
const DimLabel = memo(function DimLabel({ x1, y1, x2, y2, midX, midY, distCm, zoom, onCommit }: DimLabelProps) {
  const sw = Math.max(0.5, 1 / zoom);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-accent)" strokeWidth={sw} strokeDasharray={`${4 / zoom} ${3 / zoom}`} style={{ pointerEvents: 'none' }} />
      {(() => {
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 0.5) return null;
        const px = -(y2 - y1) / len * (4 / zoom);
        const py = (x2 - x1) / len * (4 / zoom);
        return (
          <>
            <line x1={x1 - px} y1={y1 - py} x2={x1 + px} y2={y1 + py} stroke="var(--color-accent)" strokeWidth={sw} style={{ pointerEvents: 'none' }} />
            <line x1={x2 - px} y1={y2 - py} x2={x2 + px} y2={y2 + py} stroke="var(--color-accent)" strokeWidth={sw} style={{ pointerEvents: 'none' }} />
          </>
        );
      })()}
      <EditableLabel midX={midX} midY={midY} distCm={distCm} zoom={zoom} onCommit={onCommit} />
    </g>
  );
});

// ── ColumnItem ────────────────────────────────────────────────────────────────
interface Props {
  column: Column;
  room: RoomType;
  zoom: number;
}

export const ColumnItem = memo(function ColumnItem({ column, room, zoom }: Props) {
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);
  const updateColumn = usePlanStore((s) => s.updateColumn);
  const isSelected = selectedItemId === column.id;

  const { widthCm: wc, depthCm: dc, position: pos, rotation } = column;
  const θ = (rotation * Math.PI) / 180;
  const cosθ = Math.cos(θ), sinθ = Math.sin(θ);

  const cxCm = pos.x + wc / 2;
  const cyCm = pos.y + dc / 2;
  const cxPx = cmToPx(cxCm);
  const cyPx = cmToPx(cyCm);
  const wPx = cmToPx(wc);
  const dPx = cmToPx(dc);

  // Rotate a local offset → world (cm)
  const wPt = (lx: number, ly: number) => ({
    x: cxCm + lx * cosθ - ly * sinθ,
    y: cyCm + lx * sinθ + ly * cosθ,
  });
  const wDir = (lx: number, ly: number) => ({
    x: lx * cosθ - ly * sinθ,
    y: lx * sinθ + ly * cosθ,
  });

  // 4 edge rays for free-floating labels
  const edges = [
    { edgePt: wPt(0, -dc / 2), dir: wDir(0, -1), perpDir: wDir(1, 0),  key: 'top' },
    { edgePt: wPt(0,  dc / 2), dir: wDir(0,  1), perpDir: wDir(1, 0),  key: 'bot' },
    { edgePt: wPt(-wc / 2, 0), dir: wDir(-1, 0), perpDir: wDir(0, -1), key: 'lft' },
    { edgePt: wPt( wc / 2, 0), dir: wDir( 1, 0), perpDir: wDir(0, -1), key: 'rgt' },
  ];

  // ── Drag with snap ──────────────────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedItemId(column.id);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (!canvasSvg) return;
    const r = canvasSvg.getBoundingClientRect();
    const { canvas } = usePlanStore.getState();
    const startCmX = pxToCm((e.clientX - r.left - canvas.panX) / canvas.zoom);
    const startCmY = pxToCm((e.clientY - r.top - canvas.panY) / canvas.zoom);
    const startPosX = pos.x;
    const startPosY = pos.y;

    const colId = column.id;

    const onMove = (ev: PointerEvent) => {
      const { canvas: cv, room: currentRoom } = usePlanStore.getState();
      const rr = canvasSvg.getBoundingClientRect();
      const cmX = pxToCm((ev.clientX - rr.left - cv.panX) / cv.zoom);
      const cmY = pxToCm((ev.clientY - rr.top - cv.panY) / cv.zoom);
      const rawPos = { x: startPosX + cmX - startCmX, y: startPosY + cmY - startCmY };

      if (!currentRoom) { updateColumn(colId, { position: rawPos, snappedToWall: undefined }); return; }

      // Read current column state from store so snap uses up-to-date dimensions/rotation,
      // NOT stale closure values (snap can change rotation, causing flicker if stale).
      const liveCol = (currentRoom.columns ?? []).find(c => c.id === colId);
      const liveWidthCm  = liveCol?.widthCm  ?? column.widthCm;
      const liveDepthCm  = liveCol?.depthCm  ?? column.depthCm;
      const liveRotation = liveCol?.rotation ?? column.rotation;

      // Exclude self from columns so computeSnap doesn't snap the column to its own faces
      const roomForSnap = {
        ...currentRoom,
        columns: (currentRoom.columns ?? []).filter(c => c.id !== colId),
      };

      // Use the same snap logic as furniture (computeSnap)
      const fakeItem = { widthCm: liveWidthCm, depthCm: liveDepthCm } as FurnitureCatalogItem;
      let snapResult = computeSnap(rawPos, fakeItem, roomForSnap, [], new Map(), liveRotation);

      // Corner along-wall snap: when wall-snapped, additionally snap column edge to wall endpoint
      if (snapResult.snappedTo) {
        const { wallId, side } = snapResult.snappedTo;
        const wall = currentRoom.walls.find((w) => w.id === wallId);
        if (wall) {
          const wA = currentRoom.points[wall.startPointIndex];
          const wB = currentRoom.points[wall.endPointIndex];
          const wLen = Math.hypot(wB.x - wA.x, wB.y - wA.y);
          if (wLen > 1) {
            const ux = (wB.x - wA.x) / wLen;
            const uy = (wB.y - wA.y) / wLen;
            const cx = snapResult.position.x + liveWidthCm / 2;
            const cy = snapResult.position.y + liveDepthCm / 2;
            const tAlong = (cx - wA.x) * ux + (cy - wA.y) * uy;
            const halfW = (side === 'top' || side === 'bottom') ? liveWidthCm / 2 : liveDepthCm / 2;
            const leftT = tAlong - halfW;
            const rightT = tAlong + halfW;
            let delta = 0;
            if (Math.abs(leftT) < SNAP_DISTANCE_CM) delta = -leftT;
            else if (Math.abs(rightT - wLen) < SNAP_DISTANCE_CM) delta = wLen - rightT;
            if (delta !== 0) {
              snapResult = {
                ...snapResult,
                position: { x: snapResult.position.x + delta * ux, y: snapResult.position.y + delta * uy },
              };
            }
          }
        }
      }

      // If computeSnap fired corner snap (Priority 1), snappedTo is undefined even though
      // a face may be flush with a wall — detect it via proximity check.
      const rawSnappedTo = snapResult.snappedTo
        ? { wallId: snapResult.snappedTo.wallId, side: snapResult.snappedTo.side as 'top' | 'right' | 'bottom' | 'left' }
        : detectWallFlush(snapResult.position, liveWidthCm, liveDepthCm, snapResult.rotation, currentRoom);

      updateColumn(colId, {
        position: snapResult.position,
        rotation: snapResult.rotation,
        snappedToWall: rawSnappedTo,
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Wall-snapped depth label (into room, shown for selected column only) ────
  const WallDepthLabel = () => {
    if (!column.snappedToWall) return null;
    const { wallId, side } = column.snappedToWall;
    const wall = room.walls.find((w) => w.id === wallId);
    if (!wall) return null;
    const A = room.points[wall.startPointIndex];
    const B = room.points[wall.endPointIndex];
    const wallLen = Math.hypot(B.x - A.x, B.y - A.y);
    if (wallLen < 1) return null;
    const ux = (B.x - A.x) / wallLen;
    const uy = (B.y - A.y) / wallLen;

    const halfW = (side === 'top' || side === 'bottom') ? wc / 2 : dc / 2;
    const tAlong = (cxCm - A.x) * ux + (cyCm - A.y) * uy;
    const rightT = tAlong + halfW;

    const CM = cmToPx(1);
    const Apx = { x: cmToPx(A.x), y: cmToPx(A.y) };
    const rightEdgePx = { x: Apx.x + rightT * ux * CM, y: Apx.y + rightT * uy * CM };

    const halfDepth = (side === 'top' || side === 'bottom') ? dc / 2 : wc / 2;
    const depthSpan = halfDepth * 2;
    const inX = -uy, inY = ux; // inward into room
    const depthLabelX = rightEdgePx.x + inX * halfDepth * CM + (20 / zoom) * ux;
    const depthLabelY = rightEdgePx.y + inY * halfDepth * CM + (20 / zoom) * uy;

    return (
      <EditableLabel midX={depthLabelX} midY={depthLabelY} distCm={depthSpan} zoom={zoom}
        onCommit={(d) => {
          const newWc = (side === 'top' || side === 'bottom') ? column.widthCm : Math.max(5, d);
          const newDc = (side === 'top' || side === 'bottom') ? Math.max(5, d) : column.depthCm;
          updateColumn(column.id, {
            widthCm: newWc,
            depthCm: newDc,
            position: adjustPosForDimChange(column, newWc, newDc),
          });
        }}
      />
    );
  };

  const hatchId = `col-hatch-${column.id}`;

  return (
    <g>
      <defs>
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width={6} height={6}>
          <line x1={0} y1={6} x2={6} y2={0} stroke="var(--color-room-outline)" strokeWidth={0.7} strokeOpacity={0.45} />
        </pattern>
      </defs>

      {/* Column body */}
      <g transform={`rotate(${rotation}, ${cxPx}, ${cyPx})`} style={{ cursor: 'move' }} onPointerDown={handlePointerDown}>
        <rect x={cxPx - wPx / 2} y={cyPx - dPx / 2} width={wPx} height={dPx} fill={`url(#${hatchId})`} />
        <rect
          x={cxPx - wPx / 2} y={cyPx - dPx / 2} width={wPx} height={dPx}
          fill="none"
          stroke={isSelected ? 'var(--color-primary)' : 'var(--color-room-outline)'}
          strokeWidth={isSelected ? 2 / zoom : 1.5}
        />
      </g>

      {/* Distance labels when selected */}
      {isSelected && column.snappedToWall && (() => {
        const wall = room.walls.find(w => w.id === column.snappedToWall!.wallId);
        if (!wall) return null;
        return (
          <WallSegmentLabels
            wallId={column.snappedToWall.wallId}
            wallStart={room.points[wall.startPointIndex]}
            wallEnd={room.points[wall.endPointIndex]}
            zoom={zoom}
          />
        );
      })()}
      {isSelected && column.snappedToWall && <WallDepthLabel />}
      {isSelected && !column.snappedToWall && (
        edges.map(({ edgePt, dir, perpDir, key }) => {
              const hit = castRay(edgePt.x, edgePt.y, dir.x, dir.y, room);
              if (!hit) return null;
              const ex = cmToPx(edgePt.x), ey = cmToPx(edgePt.y);
              const wx = cmToPx(hit.wx), wy = cmToPx(hit.wy);
              const OFF = 14 / zoom;
              const midX = (ex + wx) / 2 + OFF * perpDir.x;
              const midY = (ey + wy) / 2 + OFF * perpDir.y;
              return (
                <DimLabel key={key} x1={ex} y1={ey} x2={wx} y2={wy} midX={midX} midY={midY}
                  distCm={hit.dist} zoom={zoom}
                  onCommit={(dNew) => {
                    const newEdge = { x: hit.wx - dNew * dir.x, y: hit.wy - dNew * dir.y };
                    updateColumn(column.id, {
                      position: { x: pos.x + (newEdge.x - edgePt.x), y: pos.y + (newEdge.y - edgePt.y) },
                    });
                  }}
                />
              );
            })
      )}
    </g>
  );
});
