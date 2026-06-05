import { memo, useRef, useState, useCallback } from 'react';
import type { Room as RoomType, Point } from '../../types';
import { cmToPx, pxToCm } from '../../lib/geometry';
import { Wall } from './Wall';
import { FurnitureItem } from './FurnitureItem';
import { ConstraintSymbol } from './ConstraintSymbol';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { useCatalogStore } from '../../store/catalogStore';

const CORNER_DRAG_THRESHOLD_PX = 4;

interface Props {
  room: RoomType;
  viewRotation: number;
  zoom: number;
  canvasRef: React.RefObject<SVGSVGElement | null>;
}

export const Room = memo(function Room({ room, viewRotation, zoom, canvasRef }: Props) {
  const updateWallLength = usePlanStore((s) => s.updateWallLength);
  const toggleWallLock = usePlanStore((s) => s.toggleWallLock);
  const addAngleConstraint = usePlanStore((s) => s.addAngleConstraint);
  const removeConstraint = usePlanStore((s) => s.removeConstraint);
  const moveRoomPoint = usePlanStore((s) => s.moveRoomPoint);
  const furnitureInstances = usePlanStore((s) => s.furnitureInstances);
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

  // Selected corner for 90° lock popup (set on tap, cleared on action or click-away)
  const [selectedCornerIdx, setSelectedCornerIdx] = useState<number | null>(null);

  const productMap = new Map(products.map((p) => [p.id, p]));

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

  const handleWallClick = (wallId: string, e: React.PointerEvent) => {
    setSelectedCornerIdx(null);
    toggleWallSelection(wallId, e.shiftKey);
    setSelectedItemId(null);
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
      if (connectedWalls.some((w) => w.isLengthLocked)) {
        addToast({ type: 'warning', message: 'Cannot drag a corner connected to a locked wall.' });
        cornerPointerStartRef.current = null;
        return;
      }
      cornerPointerStartRef.current = null;
      draggingPointRef.current = idx;
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

  // --- Wall-selection based Lock 90° (existing) ---
  const getSharedCorner = (): { pointIndex: number; wallAId: string; wallBId: string } | null => {
    if (selectedWallIds.length !== 2) return null;
    const [aId, bId] = selectedWallIds;
    const wallA = room.walls.find((w) => w.id === aId);
    const wallB = room.walls.find((w) => w.id === bId);
    if (!wallA || !wallB) return null;
    const aIndices = [wallA.startPointIndex, wallA.endPointIndex];
    const bIndices = [wallB.startPointIndex, wallB.endPointIndex];
    const shared = aIndices.find((i) => bIndices.includes(i));
    if (shared === undefined) return null;
    return { pointIndex: shared, wallAId: aId, wallBId: bId };
  };

  const sharedCorner = getSharedCorner();
  const alreadyConstrained = sharedCorner
    ? room.constraints.some(
        (c) =>
          (c.wallAId === sharedCorner.wallAId && c.wallBId === sharedCorner.wallBId) ||
          (c.wallAId === sharedCorner.wallBId && c.wallBId === sharedCorner.wallAId)
      )
    : false;

  const handleLock90 = () => {
    if (!sharedCorner) return;
    addAngleConstraint(sharedCorner.wallAId, sharedCorner.wallBId);
    clearWallSelection();
    addToast({ type: 'success', message: '90° constraint applied.' });
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

  const cornerExistingConstraint = cornerLockWalls.length >= 2
    ? room.constraints.find(
        (c) =>
          (c.wallAId === cornerLockWalls[0].id && c.wallBId === cornerLockWalls[1].id) ||
          (c.wallAId === cornerLockWalls[1].id && c.wallBId === cornerLockWalls[0].id)
      )
    : undefined;

  const handleCornerLockBtn = () => {
    if (cornerExistingConstraint) {
      removeConstraint(cornerExistingConstraint.id);
      addToast({ type: 'success', message: 'Constraint removed.' });
    } else if (cornerLockWalls.length >= 2) {
      addAngleConstraint(cornerLockWalls[0].id, cornerLockWalls[1].id);
      addToast({ type: 'success', message: '90° constraint applied.' });
    }
    setSelectedCornerIdx(null);
  };

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
        {/* Room fill */}
        <polygon points={pointsStr} fill="var(--color-surface)" stroke="none" />

        {/* Walls with doors/windows */}
        {room.walls.map((wall) => {
          const wallDoors = room.doors.filter((d) => d.wallId === wall.id);
          const wallWindows = room.windows.filter((w) => w.wallId === wall.id);
          return (
            <Wall
              key={wall.id}
              wall={wall}
              points={room.points}
              doors={wallDoors}
              windows={wallWindows}
              viewRotation={viewRotation}
              zoom={zoom}
              isSelected={selectedWallIds.includes(wall.id)}
              onCommitLength={handleCommitLength}
              onToggleLock={toggleWallLock}
              onSelectDoor={setSelectedItemId}
              onSelectWindow={setSelectedItemId}
              onWallClick={handleWallClick}
            />
          );
        })}

        {/* Angle constraint symbols */}
        {room.constraints.map((constraint) => {
          const wallA = room.walls.find((w) => w.id === constraint.wallAId);
          const wallB = room.walls.find((w) => w.id === constraint.wallBId);
          if (!wallA || !wallB) return null;

          const aIndices = [wallA.startPointIndex, wallA.endPointIndex];
          const bIndices = [wallB.startPointIndex, wallB.endPointIndex];
          const sharedIdx = aIndices.find((i) => bIndices.includes(i));
          if (sharedIdx === undefined) return null;

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

        {/* Corner points — draggable; tappable for 90° lock */}
        {room.points.map((p, i) => (
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
          return <FurnitureItem key={instance.id} instance={instance} catalogItem={catalogItem} />;
        })}
      </g>

      {/* Corner-tap Lock 90° floating button
          foreignObject is inside <g transform="translate(panX,panY) scale(zoom)">,
          so x/y are in room-px space. Divide offsets by zoom to keep button
          the same apparent size regardless of zoom level. */}
      {cornerLockBtnPos && cornerLockWalls.length >= 2 && (
        <foreignObject
          x={cornerLockBtnPos.x + 8 / zoom}
          y={cornerLockBtnPos.y - 36 / zoom}
          width={90 / zoom}
          height={26 / zoom}
          style={{ overflow: 'visible', pointerEvents: 'auto' }}
        >
          <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top left', width: '90px', height: '26px' }}>
            <button
              onClick={handleCornerLockBtn}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                background: cornerExistingConstraint ? '#888' : 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                padding: '4px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                width: '90px',
                height: '26px',
              }}
            >
              {cornerExistingConstraint ? 'Unlock 90°' : 'Lock 90°'}
            </button>
          </div>
        </foreignObject>
      )}

      {/* Wall-selection Lock 90° floating button */}
      {wallLock90BtnPos && (
        <foreignObject
          x={wallLock90BtnPos.x + 8 / zoom}
          y={wallLock90BtnPos.y - 36 / zoom}
          width={80 / zoom}
          height={26 / zoom}
          style={{ overflow: 'visible', pointerEvents: 'auto' }}
        >
          <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top left', width: '80px', height: '26px' }}>
            <button
              onClick={handleLock90}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                padding: '4px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                width: '80px',
                height: '26px',
              }}
            >
              Lock 90°
            </button>
          </div>
        </foreignObject>
      )}
    </>
  );
});
