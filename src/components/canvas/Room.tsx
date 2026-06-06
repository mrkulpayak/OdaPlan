import { memo, useRef, useState, useCallback, useEffect } from 'react';
import type { Room as RoomType, Point, Wall as WallType } from '../../types';
import { cmToPx, pxToCm } from '../../lib/geometry';
import { Wall } from './Wall';
import { Door } from './Door';
import { WindowComp } from './Window';
import { FurnitureItem } from './FurnitureItem';
import { ColumnItem } from './ColumnItem';
import { CustomShapeItem } from './CustomShapeItem';
import { ConstraintSymbol } from './ConstraintSymbol';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { useCatalogStore } from '../../store/catalogStore';

const CORNER_DRAG_THRESHOLD_PX = 4;
const WALL_DRAG_THRESHOLD_PX = 4;

/** Compute the interior angle (degrees) between two walls meeting at sharedIdx */
function computeCornerAngleDeg(pts: Point[], wallA: WallType, wallB: WallType, sharedIdx: number): number {
  const aOtherIdx = wallA.startPointIndex === sharedIdx ? wallA.endPointIndex : wallA.startPointIndex;
  const bOtherIdx = wallB.startPointIndex === sharedIdx ? wallB.endPointIndex : wallB.startPointIndex;
  const shared = pts[sharedIdx];
  const aOther = pts[aOtherIdx];
  const bOther = pts[bOtherIdx];
  const ax = aOther.x - shared.x, ay = aOther.y - shared.y;
  const bx = bOther.x - shared.x, by = bOther.y - shared.y;
  const aLen = Math.hypot(ax, ay), bLen = Math.hypot(bx, by);
  if (aLen === 0 || bLen === 0) return 90;
  const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (aLen * bLen)));
  return Math.round(Math.acos(dot) * 180 / Math.PI);
}

interface Props {
  room: RoomType;
  viewRotation: number;
  zoom: number;
  canvasRef: React.RefObject<SVGSVGElement | null>;
}

// ── Wall-thickness band helpers ───────────────────────────────────────────────

/** Shoelace signed area — positive = clockwise in SVG (Y-down). */
function signedArea(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return s / 2;
}

/** Outward normal sign for a clockwise SVG polygon. */
function outwardSign(pts: Point[]): 1 | -1 {
  return signedArea(pts) >= 0 ? 1 : -1;
}

/** Convert a cm polygon to an SVG points string. */
function polyPts(pts: Array<{ x: number; y: number }>): string {
  return pts.map((p) => `${cmToPx(p.x)},${cmToPx(p.y)}`).join(' ');
}

/**
 * Compute the miter-join offset polygon — each vertex is the intersection of
 * the two adjacent offset wall lines.  This fills corner gaps correctly.
 */
function computeOuterPolygon(pts: Point[], sign: 1 | -1, thickness: number): Point[] {
  const n = pts.length;
  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const d1x = curr.x - prev.x, d1y = curr.y - prev.y;
    const len1 = Math.hypot(d1x, d1y);
    const d2x = next.x - curr.x, d2y = next.y - curr.y;
    const len2 = Math.hypot(d2x, d2y);
    if (len1 < 0.001 || len2 < 0.001) { result.push({ ...curr }); continue; }
    const ux1 = d1x / len1, uy1 = d1y / len1;
    const ux2 = d2x / len2, uy2 = d2y / len2;
    const nx1 = sign * uy1, ny1 = -sign * ux1;
    const nx2 = sign * uy2, ny2 = -sign * ux2;
    // Points on each offset line (both at curr offset by their wall's normal)
    const px = curr.x + thickness * nx1, py = curr.y + thickness * ny1;
    const qx = curr.x + thickness * nx2, qy = curr.y + thickness * ny2;
    // Intersection: P + t*d1 = Q + s*d2  →  solve for t
    const denom = ux1 * uy2 - uy1 * ux2;
    if (Math.abs(denom) < 0.001) {
      result.push({ x: (px + qx) / 2, y: (py + qy) / 2 });
    } else {
      const t = ((qx - px) * uy2 - (qy - py) * ux2) / denom;
      result.push({ x: px + t * ux1, y: py + t * uy1 });
    }
  }
  return result;
}

const BAND_HATCH_ID = 'wall-band-hatch';
const BAND_THICKNESS = 15; // cm
const BAND_SW = 1.5; // stroke width, matches wall lines

/**
 * Rendered BEFORE the room fill polygon.
 * The outer offset polygon (with hatch) covers both the band area and the room interior.
 * The room fill polygon renders on top and covers the interior, leaving only the band visible.
 */
function WallBandsFill({ room }: { room: RoomType }) {
  const sign = outwardSign(room.points);
  const outerPts = computeOuterPolygon(room.points, sign, BAND_THICKNESS);
  return (
    <g>
      <defs>
        <pattern id={BAND_HATCH_ID} patternUnits="userSpaceOnUse" width={6} height={6}>
          <line x1={0} y1={6} x2={6} y2={0}
            stroke="var(--color-room-outline)" strokeWidth={0.8} strokeOpacity={0.5} />
        </pattern>
      </defs>
      <polygon points={polyPts(outerPts)} fill={`url(#${BAND_HATCH_ID})`} stroke="none" />
    </g>
  );
}

/**
 * Rendered AFTER walls and door/window overlays.
 * Draws:
 *   - door section overlays (floor color) with jamb lines
 *   - window section overlays (white) with jamb lines
 *   - outer polygon stroke (outlines the full band including corners)
 */
function WallBandsOverlays({ room, floorColor }: { room: RoomType; floorColor: string }) {
  const sign = outwardSign(room.points);
  const outerPts = computeOuterPolygon(room.points, sign, BAND_THICKNESS);

  return (
    <g style={{ pointerEvents: 'none' }}>
      {room.walls.map((wall) => {
        const A = room.points[wall.startPointIndex];
        const B = room.points[wall.endPointIndex];
        const wallLen = Math.hypot(B.x - A.x, B.y - A.y);
        if (wallLen < 1) return null;
        const ux = (B.x - A.x) / wallLen, uy = (B.y - A.y) / wallLen;
        const nx = sign * uy, ny = -sign * ux;

        const doors = room.doors.filter((d) => d.wallId === wall.id);
        const windows = room.windows.filter((w) => w.wallId === wall.id);

        return (
          <g key={`band-ov-${wall.id}`}>
            {doors.map((door) => {
              const half = door.widthCm / 2;
              const s0 = Math.max(0, door.positionOnWall * wallLen - half);
              const s1 = Math.min(wallLen, door.positionOnWall * wallLen + half);
              if (s1 <= s0) return null;
              const P0 = { x: A.x + s0 * ux, y: A.y + s0 * uy };
              const P1 = { x: A.x + s1 * ux, y: A.y + s1 * uy };
              const P0o = { x: P0.x + BAND_THICKNESS * nx, y: P0.y + BAND_THICKNESS * ny };
              const P1o = { x: P1.x + BAND_THICKNESS * nx, y: P1.y + BAND_THICKNESS * ny };
              return (
                <g key={door.id}>
                  <polygon points={polyPts([P0, P1, P1o, P0o])} fill={floorColor} stroke="none" />
                  <line x1={cmToPx(P0.x)} y1={cmToPx(P0.y)} x2={cmToPx(P0o.x)} y2={cmToPx(P0o.y)}
                    stroke="var(--color-room-outline)" strokeWidth={BAND_SW} />
                  <line x1={cmToPx(P1.x)} y1={cmToPx(P1.y)} x2={cmToPx(P1o.x)} y2={cmToPx(P1o.y)}
                    stroke="var(--color-room-outline)" strokeWidth={BAND_SW} />
                </g>
              );
            })}

            {windows.map((win) => {
              const half = win.widthCm / 2;
              const s0 = Math.max(0, win.positionOnWall * wallLen - half);
              const s1 = Math.min(wallLen, win.positionOnWall * wallLen + half);
              if (s1 <= s0) return null;
              const P0 = { x: A.x + s0 * ux, y: A.y + s0 * uy };
              const P1 = { x: A.x + s1 * ux, y: A.y + s1 * uy };
              const P0o = { x: P0.x + BAND_THICKNESS * nx, y: P0.y + BAND_THICKNESS * ny };
              const P1o = { x: P1.x + BAND_THICKNESS * nx, y: P1.y + BAND_THICKNESS * ny };
              return (
                <g key={win.id}>
                  <polygon points={polyPts([P0, P1, P1o, P0o])} fill="#ffffff" stroke="none" />
                  <line x1={cmToPx(P0.x)} y1={cmToPx(P0.y)} x2={cmToPx(P0o.x)} y2={cmToPx(P0o.y)}
                    stroke="var(--color-room-outline)" strokeWidth={BAND_SW} />
                  <line x1={cmToPx(P1.x)} y1={cmToPx(P1.y)} x2={cmToPx(P1o.x)} y2={cmToPx(P1o.y)}
                    stroke="var(--color-room-outline)" strokeWidth={BAND_SW} />
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Outer polygon stroke — outlines the entire band including mitered corners */}
      <polygon points={polyPts(outerPts)} fill="none"
        stroke="var(--color-room-outline)" strokeWidth={BAND_SW} strokeLinejoin="miter" />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export const Room = memo(function Room({ room, viewRotation, zoom, canvasRef }: Props) {
  const updateWallLength = usePlanStore((s) => s.updateWallLength);
  const toggleWallLock = usePlanStore((s) => s.toggleWallLock);
  const toggleWallPin = usePlanStore((s) => s.toggleWallPin);
  const addAngleConstraint = usePlanStore((s) => s.addAngleConstraint);
  const removeConstraint = usePlanStore((s) => s.removeConstraint);
  const moveRoomPoint = usePlanStore((s) => s.moveRoomPoint);
  const translateWall = usePlanStore((s) => s.translateWall);
  const snapWallStraight = usePlanStore((s) => s.snapWallStraight);
  const furnitureInstances = usePlanStore((s) => s.furnitureInstances);
  const customShapeInstances = usePlanStore((s) => s.customShapeInstances);
  const wallsLocked = usePlanStore((s) => s.canvas.wallsLocked);
  const floorColor = usePlanStore((s) => s.canvas.floorColor);
  const addToast = useUiStore((s) => s.addToast);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);
  const selectedWallIds = useUiStore((s) => s.selectedWallIds);
  const toggleWallSelection = useUiStore((s) => s.toggleWallSelection);
  const clearWallSelection = useUiStore((s) => s.clearWallSelection);
  const products = useCatalogStore((s) => s.products);

  const canvasDims = useRef({ width: 800, height: 600 });

  // Corner dragging state
  const draggingPointRef = useRef<number | null>(null);
  // Corner tap detection: track where pointer went down on a corner
  const cornerPointerStartRef = useRef<{ idx: number; x: number; y: number } | null>(null);

  // Wall drag state
  interface WallDragState {
    wallId: string;
    startClientX: number;
    startClientY: number;
    /** Wall normal unit vector (perpendicular direction for constrained drag) */
    nx: number;
    ny: number;
    /** Accumulated perpendicular translation applied so far (cm) */
    lastT: number;
    isDragging: boolean;
  }
  const wallDragRef = useRef<WallDragState | null>(null);

  // Selected corner for angle lock popup (set on tap, cleared on action or click-away)
  const [selectedCornerIdx, setSelectedCornerIdx] = useState<number | null>(null);
  // Angle value in the popup input (initialized to current corner angle on selection)
  const [cornerAngleInput, setCornerAngleInput] = useState<string>('90');

  const productMap = new Map(products.map((p) => [p.id, p]));

  // When a new corner is selected, initialize the angle input to its current angle
  useEffect(() => {
    if (selectedCornerIdx === null) return;
    const walls = room.walls.filter(
      (w) => w.startPointIndex === selectedCornerIdx || w.endPointIndex === selectedCornerIdx
    );
    if (walls.length >= 2) {
      const angle = computeCornerAngleDeg(room.points, walls[0], walls[1], selectedCornerIdx);
      setCornerAngleInput(String(angle));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCornerIdx]);

  const svgToCm = useCallback((clientX: number, clientY: number): Point => {
    const canvas = usePlanStore.getState().canvas;
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: pxToCm((clientX - r.left - canvas.panX) / canvas.zoom),
      y: pxToCm((clientY - r.top - canvas.panY) / canvas.zoom),
    };
  }, [canvasRef]);

  const handleCommitLength = (wallId: string, newLengthCm: number) => {
    const r = canvasRef.current?.getBoundingClientRect();
    canvasDims.current = r ? { width: r.width, height: r.height } : canvasDims.current;
    const result = updateWallLength(wallId, newLengthCm, canvasDims.current.width, canvasDims.current.height);
    if (result.blocked && result.reason) {
      addToast({ type: 'warning', message: result.reason });
    }
  };

  /** Returns true if the wall can be dragged (not pinned, no pinned adjacent walls) */
  const isWallDraggable = (wallId: string): boolean => {
    const wall = room.walls.find((w) => w.id === wallId);
    if (!wall || wall.isPinned) return false;
    const p1 = wall.startPointIndex;
    const p2 = wall.endPointIndex;
    return !room.walls.some(
      (w) => w.id !== wallId && w.isPinned &&
        (w.startPointIndex === p1 || w.endPointIndex === p1 ||
         w.startPointIndex === p2 || w.endPointIndex === p2)
    );
  };

  const handleWallPointerDown = (wallId: string, e: React.PointerEvent) => {
    // If not draggable (pinned), just select
    if (!isWallDraggable(wallId)) {
      setSelectedCornerIdx(null);
      toggleWallSelection(wallId, e.shiftKey); // also sets selectedItemId: null
      return;
    }

    // Start tracking for a potential wall drag
    const wall = room.walls.find((w) => w.id === wallId)!;
    const aCm = room.points[wall.startPointIndex];
    const bCm = room.points[wall.endPointIndex];
    const wLen = Math.hypot(bCm.x - aCm.x, bCm.y - aCm.y);
    if (wLen < 1) {
      toggleWallSelection(wallId, e.shiftKey);
      return;
    }
    const ux = (bCm.x - aCm.x) / wLen;
    const uy = (bCm.y - aCm.y) / wLen;
    // Wall normal (perpendicular) = (-uy, ux)
    wallDragRef.current = {
      wallId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      nx: -uy,
      ny: ux,
      lastT: 0,
      isDragging: false,
    };

    const shiftKey = e.shiftKey;

    const onMove = (ev: PointerEvent) => {
      const drag = wallDragRef.current;
      if (!drag) return;

      const { canvas } = usePlanStore.getState();
      const dClientX = ev.clientX - drag.startClientX;
      const dClientY = ev.clientY - drag.startClientY;

      if (!drag.isDragging) {
        if (Math.hypot(dClientX, dClientY) < WALL_DRAG_THRESHOLD_PX) return;
        drag.isDragging = true;
        usePlanStore.getState().saveSnapshot();
        // Clear wall/item selection when drag starts
        setSelectedCornerIdx(null);
        setSelectedItemId(null);
      }

      // Project drag onto wall normal, convert from screen px to cm
      const dCmX = pxToCm(dClientX / canvas.zoom);
      const dCmY = pxToCm(dClientY / canvas.zoom);
      const newT = dCmX * drag.nx + dCmY * drag.ny;

      const incDeltaT = newT - drag.lastT;
      drag.lastT = newT;

      translateWall(drag.wallId, { x: incDeltaT * drag.nx, y: incDeltaT * drag.ny });
    };

    const onUp = () => {
      const drag = wallDragRef.current;
      wallDragRef.current = null;
      globalThis.removeEventListener('pointermove', onMove);
      globalThis.removeEventListener('pointerup', onUp);

      if (!drag?.isDragging) {
        // No drag occurred → treat as click (select wall)
        // toggleWallSelection already sets selectedItemId: null
        setSelectedCornerIdx(null);
        toggleWallSelection(wallId, shiftKey);
      }
    };

    globalThis.addEventListener('pointermove', onMove);
    globalThis.addEventListener('pointerup', onUp);
  };

  // --- Corner pointer handlers ---
  const handleCornerPointerDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    setSelectedItemId(null);
    cornerPointerStartRef.current = { idx, x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handleCornerPointerMove = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation(); // always prevent canvas from panning

    if (draggingPointRef.current === idx) {
      // Already dragging — move the point
      const cm = svgToCm(e.clientX, e.clientY);
      moveRoomPoint(idx, cm);
      return;
    }

    // Check if threshold has been exceeded to start dragging
    const start = cornerPointerStartRef.current;
    if (!start || start.idx !== idx) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > CORNER_DRAG_THRESHOLD_PX) {
      // Threshold exceeded → start drag
      const connectedWalls = room.walls.filter(
        (w) => w.startPointIndex === idx || w.endPointIndex === idx
      );
      // Only pinned walls block dragging; length-locked walls apply compass constraint instead
      if (connectedWalls.some((w) => w.isPinned)) {
        addToast({ type: 'warning', message: 'Bu köşe sabitlenmiş bir duvara bağlı, taşınamaz.' });
        cornerPointerStartRef.current = null;
        return;
      }
      cornerPointerStartRef.current = null;
      draggingPointRef.current = idx;
      usePlanStore.getState().saveSnapshot();
      setSelectedCornerIdx(null);
      const cm = svgToCm(e.clientX, e.clientY);
      moveRoomPoint(idx, cm);
    }
  };

  const handleCornerPointerUp = (_e: React.PointerEvent, idx: number) => {
    const wasDragging = draggingPointRef.current === idx;
    draggingPointRef.current = null;

    const start = cornerPointerStartRef.current;
    cornerPointerStartRef.current = null;

    if (!wasDragging && start?.idx === idx) {
      // Was a tap (no drag) → toggle corner selection for 90° lock
      setSelectedCornerIdx((prev) => (prev === idx ? null : idx));
      clearWallSelection();
    }
  };

  // --- Wall-selection based Lock (existing) ---
  const getSharedCorner = (): { pointIndex: number } | null => {
    if (selectedWallIds.length !== 2) return null;
    const [aId, bId] = selectedWallIds;
    const wallA = room.walls.find((w) => w.id === aId);
    const wallB = room.walls.find((w) => w.id === bId);
    if (!wallA || !wallB) return null;
    const aIndices = [wallA.startPointIndex, wallA.endPointIndex];
    const bIndices = [wallB.startPointIndex, wallB.endPointIndex];
    const shared = aIndices.find((i) => bIndices.includes(i));
    if (shared === undefined) return null;
    return { pointIndex: shared };
  };

  const sharedCorner = getSharedCorner();
  const alreadyConstrained = sharedCorner
    ? room.constraints.some((c) => c.sharedPointIndex === sharedCorner.pointIndex)
    : false;

  const handleLock90 = () => {
    if (!sharedCorner) return;
    const walls = room.walls.filter(
      (w) => w.startPointIndex === sharedCorner.pointIndex || w.endPointIndex === sharedCorner.pointIndex
    );
    const angleDeg = walls.length >= 2
      ? computeCornerAngleDeg(room.points, walls[0], walls[1], sharedCorner.pointIndex)
      : 90;
    addAngleConstraint(sharedCorner.pointIndex, angleDeg);
    clearWallSelection();
    addToast({ type: 'success', message: `${angleDeg}° constraint applied.` });
  };

  // --- Corner-tap based 90° lock button ---
  // Position in group-local (room-px) coordinates — the foreignObject is inside
  // the <g transform="translate(panX,panY) scale(zoom)"> group in Canvas, so we
  // must NOT apply panX/panY/zoom here; those are already handled by the parent transform.
  const cornerLockBtnPos = selectedCornerIdx !== null ? {
    x: cmToPx(room.points[selectedCornerIdx].x),
    y: cmToPx(room.points[selectedCornerIdx].y),
  } : null;

  const cornerLockWalls = selectedCornerIdx !== null
    ? room.walls.filter(
        (w) => w.startPointIndex === selectedCornerIdx || w.endPointIndex === selectedCornerIdx
      )
    : [];

  const cornerExistingConstraint = selectedCornerIdx !== null
    ? room.constraints.find((c) => c.sharedPointIndex === selectedCornerIdx)
    : undefined;

  const handleCornerLockBtn = () => {
    if (selectedCornerIdx === null) return;
    const parsedAngle = parseInt(cornerAngleInput, 10);
    const angleDeg = Number.isNaN(parsedAngle) ? 90 : Math.max(5, Math.min(175, parsedAngle));
    addAngleConstraint(selectedCornerIdx, angleDeg);
    addToast({ type: 'success', message: `${angleDeg}° kilitlendi.` });
    setSelectedCornerIdx(null);
  };

  const handleCornerUnlockBtn = () => {
    if (cornerExistingConstraint) {
      removeConstraint(cornerExistingConstraint.id);
      addToast({ type: 'success', message: 'Kilit kaldırıldı.' });
    }
    setSelectedCornerIdx(null);
  };

  // --- Straighten popup (single wall selected) ---
  const straightenWall = selectedWallIds.length === 1
    ? room.walls.find((w) => w.id === selectedWallIds[0]) ?? null
    : null;

  const straightenData = straightenWall ? (() => {
    const aCm = room.points[straightenWall.startPointIndex];
    const bCm = room.points[straightenWall.endPointIndex];
    const dx = bCm.x - aCm.x;
    const dy = bCm.y - aCm.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;
    // Closer to horizontal or vertical?
    const direction: 'horizontal' | 'vertical' =
      Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
    const alreadyStraight =
      direction === 'horizontal' ? Math.abs(dy) < 0.5 : Math.abs(dx) < 0.5;
    if (alreadyStraight) return null;
    // Position popup at wall midpoint, slightly offset outward
    const midX = cmToPx((aCm.x + bCm.x) / 2);
    const midY = cmToPx((aCm.y + bCm.y) / 2);
    const nx = -dy / len, ny = dx / len; // outward normal
    return { direction, wallId: straightenWall.id, midX, midY, nx, ny };
  })() : null;

  const pointsStr = room.points
    .map((p) => `${cmToPx(p.x)},${cmToPx(p.y)}`)
    .join(' ');

  // Wall-selection Lock 90° button position (group-local coordinates)
  let wallLock90BtnPos: { x: number; y: number } | null = null;
  if (sharedCorner && !alreadyConstrained) {
    const pt = room.points[sharedCorner.pointIndex];
    wallLock90BtnPos = { x: cmToPx(pt.x), y: cmToPx(pt.y) };
  }

  return (
    <>
      <g>
        {/* Wall-thickness bands — hatch fill rendered BEFORE room fill so room floor covers the interior */}
        {wallsLocked && <WallBandsFill room={room} />}

        {/* Room fill — uses --color-floor injected from Canvas */}
        <polygon points={pointsStr} fill="var(--color-floor, var(--color-surface))" stroke="none" />

        {/* Walls with doors/windows */}
        {room.walls.map((wall) => {
          const wallDoors = room.doors.filter((d) => d.wallId === wall.id);
          const wallWindows = room.windows.filter((w) => w.wallId === wall.id);
          const wallCols = (room.columns ?? []).filter((c) => c.snappedToWall != null);
          return (
            <Wall
              key={wall.id}
              wall={wall}
              points={room.points}
              doors={wallDoors}
              windows={wallWindows}
              wallColumns={wallCols}
              viewRotation={viewRotation}
              zoom={zoom}
              isSelected={selectedWallIds.includes(wall.id)}
              onCommitLength={handleCommitLength}
              onToggleLock={toggleWallLock}
              onTogglePin={toggleWallPin}
              onSelectDoor={setSelectedItemId}
              onSelectWindow={setSelectedItemId}
              onWallClick={handleWallPointerDown}
              isDraggable={isWallDraggable(wall.id)}
              wallsLocked={wallsLocked}
            />
          );
        })}

        {/* Angle constraint symbols */}
        {room.constraints.map((constraint) => {
          const sharedIdx = constraint.sharedPointIndex;
          const connectedWalls = room.walls.filter(
            (w) => w.startPointIndex === sharedIdx || w.endPointIndex === sharedIdx
          );
          if (connectedWalls.length < 2) return null;

          const wallA = connectedWalls[0];
          const wallB = connectedWalls[1];
          const cornerPt = room.points[sharedIdx];
          const wallAOtherIdx = wallA.startPointIndex === sharedIdx ? wallA.endPointIndex : wallA.startPointIndex;
          const wallBOtherIdx = wallB.startPointIndex === sharedIdx ? wallB.endPointIndex : wallB.startPointIndex;

          return (
            <ConstraintSymbol
              key={constraint.id}
              constraintId={constraint.id}
              cornerPt={cornerPt}
              wallAEnd={room.points[wallAOtherIdx]}
              wallBEnd={room.points[wallBOtherIdx]}
              onRemove={removeConstraint}
            />
          );
        })}

        {/* Corner points — hidden when walls are globally locked */}
        {!wallsLocked && room.points.map((p, i) => (
          <circle
            key={i}
            cx={cmToPx(p.x)}
            cy={cmToPx(p.y)}
            r={selectedCornerIdx === i ? 7 : 5}
            fill={selectedCornerIdx === i ? 'var(--color-primary)' : 'var(--color-room-outline)'}
            stroke={selectedCornerIdx === i ? '#fff' : 'none'}
            strokeWidth={1.5}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => handleCornerPointerDown(e, i)}
            onPointerMove={(e) => handleCornerPointerMove(e, i)}
            onPointerUp={(e) => handleCornerPointerUp(e, i)}
          />
        ))}

        {/* Furniture instances */}
        {furnitureInstances.map((instance) => {
          const catalogItem = productMap.get(instance.catalogItemId);
          if (!catalogItem) return null;
          return <FurnitureItem key={instance.id} instance={instance} catalogItem={catalogItem} zoom={zoom} />;
        })}

        {/* Structural columns */}
        {(room.columns ?? []).map((col) => (
          <ColumnItem key={col.id} column={col} room={room} zoom={zoom} />
        ))}

        {/* Custom parametric shapes */}
        {(customShapeInstances ?? []).map((cs) => (
          <CustomShapeItem key={cs.id} instance={cs} zoom={zoom} />
        ))}

        {/* ── Door & Window overlay — rendered AFTER furniture so they appear on top ── */}
        {room.walls.map((wall) => {
          const aCm = room.points[wall.startPointIndex];
          const bCm = room.points[wall.endPointIndex];
          return (
            <g key={`dw-${wall.id}`}>
              {room.doors.filter((d) => d.wallId === wall.id).map((door) => (
                <Door key={door.id} door={door} wallStart={aCm} wallEnd={bCm} onSelect={setSelectedItemId} />
              ))}
              {room.windows.filter((w) => w.wallId === wall.id).map((win) => (
                <WindowComp key={win.id} window={win} wallStart={aCm} wallEnd={bCm} onSelect={setSelectedItemId} />
              ))}
            </g>
          );
        })}

        {/* Wall-thickness band overlays — door/window color sections and outer stroke, on top of everything */}
        {wallsLocked && <WallBandsOverlays room={room} floorColor={floorColor} />}
      </g>

      {/* Corner-tap angle lock popup
          foreignObject is inside <g transform="translate(panX,panY) scale(zoom)">,
          so x/y are in room-px space. Divide all pixel offsets by zoom. */}
      {cornerLockBtnPos && cornerLockWalls.length >= 2 && (
        <foreignObject
          data-interactive="true"
          x={cornerLockBtnPos.x + 8 / zoom}
          y={cornerLockBtnPos.y - 80 / zoom}
          width={160 / zoom}
          height={80 / zoom}
          style={{ overflow: 'visible', pointerEvents: 'auto' }}
        >
          <div style={{
            transform: `scale(${1 / zoom})`,
            transformOrigin: 'top left',
            width: '160px',
            fontFamily: 'var(--font-body)',
          }}>
            {/* Label row */}
            <div style={{ fontSize: '10px', color: '#555', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Köşe açısı</span>
              {cornerExistingConstraint && (
                <span style={{ color: '#555', fontWeight: 600 }}>
                  Kilitli: {cornerExistingConstraint.angleDeg ?? 90}°
                </span>
              )}
            </div>
            {/* Input + button row */}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                type="number"
                min={5}
                max={175}
                value={cornerAngleInput}
                onChange={(e) => setCornerAngleInput(e.target.value)}
                style={{
                  width: '52px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  background: '#f0f0f0',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  padding: '3px 5px',
                  textAlign: 'right',
                }}
              />
              <span style={{ fontSize: '12px', color: '#555' }}>°</span>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleCornerLockBtn}
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-body)',
                  fontSize: '11px',
                  background: '#f0f0f0',
                  color: '#333',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                  height: '26px',
                }}
              >
                Kilitle
              </button>
              {cornerExistingConstraint && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleCornerUnlockBtn}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '11px',
                    background: '#f0f0f0',
                    color: '#333',
                    border: '1px solid #ccc',
                    borderRadius: '3px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                    height: '26px',
                  }}
                >
                  Aç
                </button>
              )}
            </div>
          </div>
        </foreignObject>
      )}

      {/* Wall-selection Lock 90° floating button */}
      {wallLock90BtnPos && (
        <foreignObject
          data-interactive="true"
          x={wallLock90BtnPos.x + 8 / zoom}
          y={wallLock90BtnPos.y - 36 / zoom}
          width={80 / zoom}
          height={26 / zoom}
          style={{ overflow: 'visible', pointerEvents: 'auto' }}
        >
          <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top left', width: '80px', height: '26px' }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleLock90}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                background: '#f0f0f0',
                color: '#333',
                border: '1px solid #ccc',
                borderRadius: '3px',
                padding: '4px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                width: '80px',
                height: '26px',
              }}
            >
              Açıyı Kilitle
            </button>
          </div>
        </foreignObject>
      )}

      {/* Straighten wall popup — shown when a single slightly-off wall is selected */}
      {straightenData && (
        <foreignObject
          data-interactive="true"
          x={straightenData.midX + (24 / zoom) * straightenData.nx}
          y={straightenData.midY + (24 / zoom) * straightenData.ny - 13 / zoom}
          width={70 / zoom}
          height={26 / zoom}
          style={{ overflow: 'visible', pointerEvents: 'auto' }}
        >
          <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top left', width: '70px', height: '26px' }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                snapWallStraight(straightenData.wallId, straightenData.direction);
                clearWallSelection();
              }}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                background: '#f0f0f0',
                color: '#333',
                border: '1px solid #ccc',
                borderRadius: '3px',
                padding: '4px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                width: '70px',
                height: '26px',
              }}
            >
              {straightenData.direction === 'horizontal' ? 'Yatay' : 'Dikey'}
            </button>
          </div>
        </foreignObject>
      )}
    </>
  );
});
