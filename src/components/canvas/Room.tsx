import { memo, useRef, useEffect, useCallback } from 'react';
import type { Room as RoomType, Point } from '../../types';
import { cmToPx, pxToCm } from '../../lib/geometry';
import { Wall } from './Wall';
import { FurnitureItem } from './FurnitureItem';
import { ConstraintSymbol } from './ConstraintSymbol';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { useCatalogStore } from '../../store/catalogStore';

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
  const draggingPointRef = useRef<number | null>(null);
  const productMap = new Map(products.map((p) => [p.id, p]));

  useEffect(() => {
    if (canvasRef.current) {
      const r = canvasRef.current.getBoundingClientRect();
      canvasDims.current = { width: r.width, height: r.height };
    }
  });

  const svgToCm = useCallback((clientX: number, clientY: number): Point => {
    const canvas = usePlanStore.getState().canvas;
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: pxToCm((clientX - r.left - canvas.panX) / canvas.zoom),
      y: pxToCm((clientY - r.top - canvas.panY) / canvas.zoom),
    };
  }, [canvasRef]);

  const handleCommitLength = (wallId: string, newLengthCm: number) => {
    const result = updateWallLength(wallId, newLengthCm, canvasDims.current.width, canvasDims.current.height);
    if (result.blocked && result.reason) {
      addToast({ type: 'warning', message: result.reason });
    }
  };

  const handleWallClick = (wallId: string, e: React.PointerEvent) => {
    toggleWallSelection(wallId, e.shiftKey);
    setSelectedItemId(null);
  };

  // Check if 2 selected walls share a corner and are already at 90°
  const getSharedCorner = (): { pointIndex: number; wallAId: string; wallBId: string } | null => {
    if (selectedWallIds.length !== 2) return null;
    const [aId, bId] = selectedWallIds;
    const wallA = room.walls.find((w) => w.id === aId);
    const wallB = room.walls.find((w) => w.id === bId);
    if (!wallA || !wallB) return null;

    // Find shared point index
    const aIndices = [wallA.startPointIndex, wallA.endPointIndex];
    const bIndices = [wallB.startPointIndex, wallB.endPointIndex];
    const shared = aIndices.find((i) => bIndices.includes(i));
    if (shared === undefined) return null;

    return { pointIndex: shared, wallAId: aId, wallBId: bId };
  };

  const sharedCorner = getSharedCorner();

  // Check if existing constraint covers the selected walls
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

  // Corner point dragging
  const handleCornerPointerDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    const connectedWalls = room.walls.filter(
      (w) => w.startPointIndex === idx || w.endPointIndex === idx
    );
    if (connectedWalls.some((w) => w.isLengthLocked)) {
      addToast({ type: 'warning', message: 'Cannot drag a corner connected to a locked wall.' });
      return;
    }
    draggingPointRef.current = idx;
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handleCornerPointerMove = (e: React.PointerEvent, idx: number) => {
    if (draggingPointRef.current !== idx) return;
    const cm = svgToCm(e.clientX, e.clientY);
    moveRoomPoint(idx, cm);
  };

  const handleCornerPointerUp = () => {
    draggingPointRef.current = null;
  };

  const pointsStr = room.points
    .map((p) => `${cmToPx(p.x)},${cmToPx(p.y)}`)
    .join(' ');

  // Lock 90° button position (screen coords via SVG)
  let lock90BtnPos: { x: number; y: number } | null = null;
  if (sharedCorner && !alreadyConstrained) {
    const canvas = usePlanStore.getState().canvas;
    const pt = room.points[sharedCorner.pointIndex];
    const svgX = cmToPx(pt.x) * canvas.zoom + canvas.panX;
    const svgY = cmToPx(pt.y) * canvas.zoom + canvas.panY;
    lock90BtnPos = { x: svgX + 16, y: svgY - 32 };
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

        {/* Corner points — draggable */}
        {room.points.map((p, i) => (
          <circle
            key={i}
            cx={cmToPx(p.x)}
            cy={cmToPx(p.y)}
            r={5}
            fill="var(--color-room-outline)"
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => handleCornerPointerDown(e, i)}
            onPointerMove={(e) => handleCornerPointerMove(e, i)}
            onPointerUp={handleCornerPointerUp}
          />
        ))}

        {/* Furniture instances */}
        {furnitureInstances.map((instance) => {
          const catalogItem = productMap.get(instance.catalogItemId);
          if (!catalogItem) return null;
          return <FurnitureItem key={instance.id} instance={instance} catalogItem={catalogItem} />;
        })}
      </g>

      {/* Lock 90° floating button — rendered as SVG foreignObject to stay in coordinate space */}
      {lock90BtnPos && (
        <foreignObject
          x={lock90BtnPos.x}
          y={lock90BtnPos.y}
          width={80}
          height={28}
          style={{ overflow: 'visible', pointerEvents: 'auto' }}
        >
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
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            }}
          >
            Lock 90°
          </button>
        </foreignObject>
      )}
    </>
  );
});
