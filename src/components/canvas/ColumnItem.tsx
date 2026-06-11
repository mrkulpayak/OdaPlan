import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { cmToPx, pxToCm } from '../../lib/geometry';
import { closestPointOnSegment } from '../../lib/geometry';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { computeSnap, collectWallItemEdges, snapToWallItemEdges, rotatedSideMidpointsExport, pushOffWalls } from '../../hooks/useSnap';
import { SNAP_DISTANCE_CM } from '../../lib/constants';
import type { Column, Room as RoomType, FurnitureCatalogItem, FurnitureFrontSide } from '../../types';
import { WallSegmentLabels } from './WallSegmentLabels';
import { SelectionHandles } from './SelectionHandles';
import { RadialRotateMenu } from './RadialRotateMenu';
import type { Point } from '../../types';

// ── Detect ALL faces that are flush against any wall ─────────────────────────
export function detectAllFlushSides(
  pos: Point, wc: number, dc: number, rotation: number, room: RoomType,
  tolCm = 2,
): Array<'top' | 'right' | 'bottom' | 'left'> {
  const θ = (rotation * Math.PI) / 180;
  const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
  const cx = pos.x + wc / 2, cy = pos.y + dc / 2;

  const faces = [
    { side: 'top'    as const, lx: 0,       ly: -dc / 2 },
    { side: 'bottom' as const, lx: 0,       ly:  dc / 2 },
    { side: 'left'   as const, lx: -wc / 2, ly: 0       },
    { side: 'right'  as const, lx:  wc / 2, ly: 0       },
  ];

  const result: Array<'top' | 'right' | 'bottom' | 'left'> = [];
  for (const { side, lx, ly } of faces) {
    const fx = cx + lx * cosθ - ly * sinθ;
    const fy = cy + lx * sinθ + ly * cosθ;
    for (const wall of room.walls) {
      const A = room.points[wall.startPointIndex];
      const B = room.points[wall.endPointIndex];
      const wLen = Math.hypot(B.x - A.x, B.y - A.y);
      if (wLen < 1) continue;
      const wux = (B.x - A.x) / wLen, wuy = (B.y - A.y) / wLen;
      const dx = fx - A.x, dy = fy - A.y;
      const perp = Math.abs(-dx * wuy + dy * wux);
      const along = dx * wux + dy * wuy;
      if (perp < tolCm && along >= -tolCm && along <= wLen + tolCm) {
        result.push(side);
        break;
      }
    }
  }
  return result;
}

/**
 * Recompute the column top-left position after a dimension change so that
 * all currently-flush wall faces remain flush.
 *
 * Key insight: X-axis anchor and Y-axis anchor are INDEPENDENT.
 *   • X position → determined by which of {left, right} faces is flush
 *   • Y position → determined by which of {top, bottom} faces is flush
 *
 * This correctly handles all four corners, single-wall snaps, and the case
 * where the snapped side is perpendicular to the dimension being changed
 * (e.g. primary='top' but 'right' is also flush — both must stay fixed).
 *
 * Works correctly for rotation=0 (common case).
 * For rotated columns the same face-midpoint logic is used per axis.
 */
export function adjustColPosForCorner(
  col: Column, newWc: number, newDc: number, room: RoomType,
): Point {
  // Collect all flush sides. Always include snappedToWall.side as a guaranteed anchor.
  const detected = detectAllFlushSides(col.position, col.widthCm, col.depthCm, col.rotation, room);
  const allFlush = new Set(detected);
  if (col.snappedToWall) allFlush.add(col.snappedToWall.side);
  if (allFlush.size === 0) return col.position;

  const θ = (col.rotation * Math.PI) / 180;
  const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
  const cx = col.position.x + col.widthCm / 2;
  const cy = col.position.y + col.depthCm / 2;

  // Anchor each flush face in LOCAL space, then rotate the combined delta to
  // world space. Keeping a face fixed means the center shifts by
  // (oldOffset − newOffset) along that face's local axis — this is rotation-
  // independent, so it works at any angle (0/90/180/270 and angled walls).
  // Local X axis ← left/right faces; local Y axis ← top/bottom faces.
  let dlx = 0;
  if (allFlush.has('right'))     dlx = (col.widthCm - newWc) / 2;
  else if (allFlush.has('left')) dlx = (newWc - col.widthCm) / 2;

  let dly = 0;
  if (allFlush.has('top'))         dly = (newDc - col.depthCm) / 2;
  else if (allFlush.has('bottom')) dly = (col.depthCm - newDc) / 2;

  const newCx = cx + dlx * cosθ - dly * sinθ;
  const newCy = cy + dlx * sinθ + dly * cosθ;

  return { x: newCx - newWc / 2, y: newCy - newDc / 2 };
}

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
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-primary)" strokeWidth={sw} strokeDasharray={`${4 / zoom} ${3 / zoom}`} style={{ pointerEvents: 'none' }} />
      {(() => {
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 0.5) return null;
        const px = -(y2 - y1) / len * (4 / zoom);
        const py = (x2 - x1) / len * (4 / zoom);
        return (
          <>
            <line x1={x1 - px} y1={y1 - py} x2={x1 + px} y2={y1 + py} stroke="var(--color-primary)" strokeWidth={sw} style={{ pointerEvents: 'none' }} />
            <line x1={x2 - px} y1={y2 - py} x2={x2 + px} y2={y2 + py} stroke="var(--color-primary)" strokeWidth={sw} style={{ pointerEvents: 'none' }} />
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
  const removeColumn = usePlanStore((s) => s.removeColumn);
  const addColumn    = usePlanStore((s) => s.addColumn);
  const wallsLocked  = usePlanStore((s) => s.canvas.wallsLocked);
  const isSelected = selectedItemId === column.id;

  // ── Radial rotate menu (mirrors FurnitureItem) ────────────────────────────
  const [radialActive, setRadialActive] = useState(false);
  const [radialAngle, setRadialAngle] = useState(column.rotation);
  const originalAngleRef = useRef(column.rotation);

  const handleOpenRadial = useCallback(() => {
    originalAngleRef.current = usePlanStore.getState().room?.columns?.find(c => c.id === column.id)?.rotation ?? column.rotation;
    setRadialAngle(originalAngleRef.current);
    setRadialActive(true);
  }, [column.id, column.rotation]);

  const handleRadialAngleChange = useCallback((angle: number) => {
    setRadialAngle(angle);
    updateColumn(column.id, { rotation: angle, snappedToWall: undefined });
  }, [updateColumn, column.id]);

  const handleRadialConfirm = useCallback(() => {
    setRadialActive(false);
  }, []);

  const handleRadialCancel = useCallback(() => {
    updateColumn(column.id, { rotation: originalAngleRef.current, snappedToWall: undefined });
    setRadialActive(false);
  }, [updateColumn, column.id]);

  useEffect(() => {
    if (!isSelected) setRadialActive(false);
  }, [isSelected]);

  // ── Keyboard delete ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSelected) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        removeColumn(column.id);
        setSelectedItemId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSelected, column.id, removeColumn, setSelectedItemId]);

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
  // dragRef: raw pointer-down state (positions, canvas element).
  // dragLiveRef: snap state that must stay synchronous between React renders.
  //   rotation is FIXED at drag-start (never updated during drag) to prevent
  //   the oscillation / auto-rotate caused by snap changing rotation each frame.
  //   snappedTo tracks the currently locked wall side (hysteresis).
  const dragRef = useRef<{
    startCmX: number;
    startCmY: number;
    startPosX: number;
    startPosY: number;
    canvasSvg: SVGSVGElement;
  } | null>(null);

  const dragLiveRef = useRef<{
    rotation: number;
    snappedTo: Column['snappedToWall'];
  }>({ rotation: column.rotation, snappedTo: column.snappedToWall });

  const colId = column.id;

  // handlePointerDown uses window-level listeners so SelectionHandles' drag
  // rect (onStartMoveDrag) and the column body both work correctly without
  // needing to rely on React event bubbling / pointer capture routing.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    usePlanStore.getState().saveSnapshot();
    setSelectedItemId(colId);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (!canvasSvg) return;
    const r = canvasSvg.getBoundingClientRect();
    const { canvas } = usePlanStore.getState();
    const startCmX = pxToCm((e.clientX - r.left - canvas.panX) / canvas.zoom);
    const startCmY = pxToCm((e.clientY - r.top - canvas.panY) / canvas.zoom);
    const liveState = usePlanStore.getState();
    const liveCol = (liveState.room?.columns ?? []).find(c => c.id === colId);

    dragLiveRef.current = {
      rotation: liveCol?.rotation ?? column.rotation,
      snappedTo: liveCol?.snappedToWall ?? column.snappedToWall,
    };

    dragRef.current = {
      startCmX,
      startCmY,
      startPosX: liveCol?.position.x ?? 0,
      startPosY: liveCol?.position.y ?? 0,
      canvasSvg,
    };

    const onMove = (me: PointerEvent) => {
      if (!dragRef.current) return;
      const { startCmX: scx, startCmY: scy, startPosX: spx, startPosY: spy, canvasSvg: svg } = dragRef.current;
      const { canvas: cv, room: currentRoom } = usePlanStore.getState();
      const rr = svg.getBoundingClientRect();
      const cmX = pxToCm((me.clientX - rr.left - cv.panX) / cv.zoom);
      const cmY = pxToCm((me.clientY - rr.top - cv.panY) / cv.zoom);
      const rawPos = { x: spx + cmX - scx, y: spy + cmY - scy };

      if (!currentRoom) { updateColumn(colId, { position: rawPos, snappedToWall: undefined }); return; }

      const liveCol2 = (currentRoom.columns ?? []).find(c => c.id === colId);
      const liveWidthCm = liveCol2?.widthCm ?? column.widthCm;
      const liveDepthCm = liveCol2?.depthCm ?? column.depthCm;

      const { rotation: fixedRotation, snappedTo: liveSnappedTo } = dragLiveRef.current;

      const roomForSnap = {
        ...currentRoom,
        columns: (currentRoom.columns ?? []).filter(c => c.id !== colId),
      };
      const fakeItem = { widthCm: liveWidthCm, depthCm: liveDepthCm } as FurnitureCatalogItem;
      const snapRoomForCol = cv.snapEnabled !== false ? roomForSnap : null;

      const snapResult = computeSnap(
        rawPos, fakeItem, snapRoomForCol, [], new Map(),
        fixedRotation,
        liveSnappedTo?.side as FurnitureFrontSide | undefined,
      );

      dragLiveRef.current.snappedTo = snapResult.snappedTo
        ? { wallId: snapResult.snappedTo.wallId, side: snapResult.snappedTo.side as 'top' | 'right' | 'bottom' | 'left' }
        : undefined;

      let finalPos = snapResult.position;
      if (snapResult.snappedTo) {
        const { wallId, side } = snapResult.snappedTo;
        const wall = currentRoom.walls.find(w => w.id === wallId);
        if (wall) {
          const wA = currentRoom.points[wall.startPointIndex];
          const wB = currentRoom.points[wall.endPointIndex];
          const wLen = Math.hypot(wB.x - wA.x, wB.y - wA.y);
          if (wLen > 1) {
            const ux = (wB.x - wA.x) / wLen, uy = (wB.y - wA.y) / wLen;
            const mids = rotatedSideMidpointsExport(rawPos, liveWidthCm, liveDepthCm, fixedRotation);
            const mid  = mids[side as FurnitureFrontSide];
            const wallPt = closestPointOnSegment(mid, wA, wB);
            const cx0 = rawPos.x + liveWidthCm / 2, cy0 = rawPos.y + liveDepthCm / 2;
            const rdx = mid.x - cx0, rdy = mid.y - cy0;
            finalPos = { x: wallPt.x - rdx - liveWidthCm / 2, y: wallPt.y - rdy - liveDepthCm / 2 };

            const cx1 = finalPos.x + liveWidthCm / 2, cy1 = finalPos.y + liveDepthCm / 2;
            const tAlong = (cx1 - wA.x) * ux + (cy1 - wA.y) * uy;
            const halfW  = (side === 'top' || side === 'bottom') ? liveWidthCm / 2 : liveDepthCm / 2;
            const leftT  = tAlong - halfW, rightT = tAlong + halfW;
            let delta = 0;
            if (Math.abs(leftT) < SNAP_DISTANCE_CM) delta = -leftT;
            else if (Math.abs(rightT - wLen) < SNAP_DISTANCE_CM) delta = wLen - rightT;
            if (delta === 0) {
              const edgeList = collectWallItemEdges(wallId, wA.x, wA.y, wB.x, wB.y, colId, currentRoom);
              delta = snapToWallItemEdges(tAlong, halfW, SNAP_DISTANCE_CM / 2, edgeList);
            }
            if (delta !== 0) finalPos = { x: finalPos.x + delta * ux, y: finalPos.y + delta * uy };
          }
        }
      }

      // The flush recompute above bypasses computeSnap's straddle guard — re-apply
      // it so a wall-snapped column can't slide across a perpendicular wall.
      // (Pushing happens along the offending wall's normal, which is parallel to
      // the snapped wall, so flushness is preserved.)
      finalPos = pushOffWalls(finalPos, liveWidthCm, liveDepthCm, fixedRotation, currentRoom);

      const newSnappedTo = dragLiveRef.current.snappedTo
        ?? detectWallFlush(finalPos, liveWidthCm, liveDepthCm, fixedRotation, currentRoom);

      updateColumn(colId, { position: finalPos, snappedToWall: newSnappedTo });
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [colId, column.rotation, column.snappedToWall, column.widthCm, column.depthCm, updateColumn, setSelectedItemId]);

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
            position: adjustColPosForCorner(column, newWc, newDc, room),
          });
        }}
      />
    );
  };

  const hatchId = `col-hatch-${column.id}`;

  return (
    <g>
      {/* hatchId defs — local coordinate system (0,0 origin) */}
      <defs>
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width={6} height={6}
          patternTransform={`rotate(${-rotation}, ${wPx / 2}, ${dPx / 2})`}>
          <line x1={0} y1={6} x2={6} y2={0} stroke="var(--color-room-outline)" strokeWidth={0.8} strokeOpacity={0.5} />
        </pattern>
      </defs>

      {/* Column body — translated to top-left, rotated around local centre (same as FurnitureItem) */}
      <g
        transform={`translate(${cxPx - wPx / 2}, ${cyPx - dPx / 2}) rotate(${rotation}, ${wPx / 2}, ${dPx / 2})`}
        style={{ cursor: isSelected ? 'default' : 'move' }}
        onPointerDown={handlePointerDown}
      >
        <rect x={0} y={0} width={wPx} height={dPx} fill="var(--color-background)" />
        <rect x={0} y={0} width={wPx} height={dPx} fill={`url(#${hatchId})`} />
        {(() => {
          const sc = isSelected ? 'var(--color-primary)' : 'var(--color-room-outline)';
          const sw = isSelected ? 2 / zoom : 1.5;

          // When walls locked, hide faces that are flush against any wall
          if (wallsLocked && column.snappedToWall) {
            const θ = (rotation * Math.PI) / 180;
            const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
            const faceOffsets = [
              { key: 'top'    as const, lx: 0,        ly: -dc / 2 },
              { key: 'bottom' as const, lx: 0,        ly:  dc / 2 },
              { key: 'left'   as const, lx: -wc / 2,  ly: 0       },
              { key: 'right'  as const, lx:  wc / 2,  ly: 0       },
            ];
            const hiddenSides = new Set<string>();
            for (const { key, lx, ly } of faceOffsets) {
              const fx = cxCm + lx * cosθ - ly * sinθ;
              const fy = cyCm + lx * sinθ + ly * cosθ;
              for (const wall of room.walls) {
                const A = room.points[wall.startPointIndex];
                const B = room.points[wall.endPointIndex];
                const wLen = Math.hypot(B.x - A.x, B.y - A.y);
                if (wLen < 1) continue;
                const wux = (B.x - A.x) / wLen, wuy = (B.y - A.y) / wLen;
                const dx = fx - A.x, dy = fy - A.y;
                const perp = Math.abs(-dx * wuy + dy * wux);
                const along = dx * wux + dy * wuy;
                if (perp < 2 && along >= -2 && along <= wLen + 2) {
                  hiddenSides.add(key);
                  break;
                }
              }
            }
            // Coordinates in local (0,0) space
            const sides = [
              { key: 'top',    x1: 0,    y1: 0,    x2: wPx, y2: 0    },
              { key: 'right',  x1: wPx,  y1: 0,    x2: wPx, y2: dPx  },
              { key: 'bottom', x1: 0,    y1: dPx,  x2: wPx, y2: dPx  },
              { key: 'left',   x1: 0,    y1: 0,    x2: 0,   y2: dPx  },
            ] as const;
            return (
              <>
                {sides.filter(s => !hiddenSides.has(s.key)).map(s => (
                  <line key={s.key} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={sc} strokeWidth={sw} strokeLinecap="round" />
                ))}
              </>
            );
          }

          return <rect x={0} y={0} width={wPx} height={dPx} fill="none" stroke={sc} strokeWidth={sw} />;
        })()}

        {/* SelectionHandles lives inside the rotate group — same as FurnitureItem */}
        {isSelected && (
          <SelectionHandles
            widthCm={wc}
            depthCm={dc}
            rotation={rotation}
            zoom={zoom}
            radialActive={radialActive}
            onStartMoveDrag={handlePointerDown}
            onRotate90={() => {
              usePlanStore.getState().saveSnapshot();
              updateColumn(column.id, { rotation: (rotation + 90) % 360, snappedToWall: undefined });
            }}
            onDelete={() => {
              usePlanStore.getState().saveSnapshot();
              removeColumn(column.id);
              setSelectedItemId(null);
            }}
            onDuplicate={() => {
              usePlanStore.getState().saveSnapshot();
              addColumn({
                ...column,
                id: crypto.randomUUID(),
                position: { x: column.position.x + 20, y: column.position.y + 20 },
                snappedToWall: undefined,
              });
            }}
            onOpenRadial={handleOpenRadial}
          />
        )}
      </g>

      {/* RadialRotateMenu — outside the rotate group, at world-px center */}
      {isSelected && radialActive && (
        <RadialRotateMenu
          cx={cxPx}
          cy={cyPx}
          currentAngle={radialAngle}
          originalAngle={originalAngleRef.current}
          zoom={zoom}
          onAngleChange={handleRadialAngleChange}
          onConfirm={handleRadialConfirm}
          onCancel={handleRadialCancel}
        />
      )}

      {/* Distance labels when selected — one set per flush wall (corner columns touch two) */}
      {isSelected && column.snappedToWall && (() => {
        // Collect every wall any column face is flush against, plus the snapped wall.
        const flushWallIds = new Set<string>([column.snappedToWall!.wallId]);
        const tol = 2;
        const faceOffsets = [
          { lx: 0,       ly: -dc / 2 },
          { lx: 0,       ly:  dc / 2 },
          { lx: -wc / 2, ly: 0       },
          { lx:  wc / 2, ly: 0       },
        ];
        for (const { lx, ly } of faceOffsets) {
          const fx = cxCm + lx * cosθ - ly * sinθ;
          const fy = cyCm + lx * sinθ + ly * cosθ;
          for (const wall of room.walls) {
            const A = room.points[wall.startPointIndex];
            const B = room.points[wall.endPointIndex];
            const wLen = Math.hypot(B.x - A.x, B.y - A.y);
            if (wLen < 1) continue;
            const wux = (B.x - A.x) / wLen, wuy = (B.y - A.y) / wLen;
            const dx = fx - A.x, dy = fy - A.y;
            const perp = Math.abs(-dx * wuy + dy * wux);
            const along = dx * wux + dy * wuy;
            if (perp < tol && along >= -tol && along <= wLen + tol) flushWallIds.add(wall.id);
          }
        }
        return [...flushWallIds].map(wid => {
          const wall = room.walls.find(w => w.id === wid);
          if (!wall) return null;
          return (
            <WallSegmentLabels
              key={`wsl-${wid}`}
              wallId={wid}
              wallStart={room.points[wall.startPointIndex]}
              wallEnd={room.points[wall.endPointIndex]}
              zoom={zoom}
            />
          );
        });
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
