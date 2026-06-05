import { memo, useRef } from 'react';
import { cmToPx } from '../../lib/geometry';
import { useUiStore } from '../../store/uiStore';
import { useDrag } from '../../hooks/useDrag';
import { FurnitureShape } from './FurnitureShape';
import { SelectionHandles } from './SelectionHandles';
import type { FurnitureInstance, FurnitureCatalogItem } from '../../types';

const DRAG_THRESHOLD_PX = 4;

interface Props {
  instance: FurnitureInstance;
  catalogItem: FurnitureCatalogItem;
}

export const FurnitureItem = memo(function FurnitureItem({ instance, catalogItem }: Props) {
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);
  const { startMoveDrag } = useDrag();

  const isSelected = selectedItemId === instance.id;

  // Track pending drag: pointer must move > DRAG_THRESHOLD_PX to start dragging
  const pendingDragRef = useRef<{ x: number; y: number } | null>(null);

  const x = cmToPx(instance.position.x);
  const y = cmToPx(instance.position.y);
  const w = cmToPx(catalogItem.widthCm);
  const d = cmToPx(catalogItem.depthCm);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedItemId(instance.id);
    // Capture pointer and record start for threshold drag detection
    e.currentTarget.setPointerCapture(e.pointerId);
    pendingDragRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pendingDragRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - pendingDragRef.current.x;
    const dy = e.clientY - pendingDragRef.current.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      pendingDragRef.current = null;
      startMoveDrag(e, instance, catalogItem);
    }
  };

  const handlePointerUp = () => {
    pendingDragRef.current = null;
  };

  const handleStartMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    pendingDragRef.current = null;
    startMoveDrag(e, instance, catalogItem);
  };

  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${instance.rotation}, ${w / 2}, ${d / 2})`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: isSelected ? 'default' : 'pointer' }}
    >
      <FurnitureShape
        shapeType={catalogItem.shapeType}
        widthCm={catalogItem.widthCm}
        depthCm={catalogItem.depthCm}
        params={catalogItem.params}
        frontSide={catalogItem.frontSide}
        isSelected={isSelected}
      />

      {/* Name label when selected */}
      {isSelected && (
        <text
          x={w / 2}
          y={-8}
          textAnchor="middle"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fill: 'var(--color-text)',
            pointerEvents: 'none',
          }}
        >
          {catalogItem.name}
        </text>
      )}

      {isSelected && (
        <SelectionHandles
          instanceId={instance.id}
          widthCm={catalogItem.widthCm}
          depthCm={catalogItem.depthCm}
          onStartMoveDrag={handleStartMove}
        />
      )}
    </g>
  );
});
