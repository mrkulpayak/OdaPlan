import { memo, useRef, useEffect } from 'react';
import { cmToPx } from '../../lib/geometry';
import { useUiStore } from '../../store/uiStore';
import { usePlanStore } from '../../store/planStore';
import { useDrag } from '../../hooks/useDrag';
import { FurnitureShape } from './FurnitureShape';
import { SelectionHandles } from './SelectionHandles';
import type { FurnitureInstance, FurnitureCatalogItem } from '../../types';

const DRAG_THRESHOLD_PX = 4;

interface Props {
  instance: FurnitureInstance;
  catalogItem: FurnitureCatalogItem;
  zoom: number;
}

export const FurnitureItem = memo(function FurnitureItem({ instance, catalogItem, zoom }: Props) {
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);
  const removeFurnitureInstance = usePlanStore((s) => s.removeFurnitureInstance);
  const rotateFurniture = usePlanStore((s) => s.rotateFurniture);
  const rotateFurnitureToAngle = usePlanStore((s) => s.rotateFurnitureToAngle);
  const duplicateFurnitureInstance = usePlanStore((s) => s.duplicateFurnitureInstance);
  const { startMoveDrag } = useDrag();

  const isSelected = selectedItemId === instance.id;

  // Track pending drag: pointer must move > DRAG_THRESHOLD_PX to start dragging
  const pendingDragRef = useRef<{ x: number; y: number } | null>(null);

  const x = cmToPx(instance.position.x);
  const y = cmToPx(instance.position.y);
  const w = cmToPx(catalogItem.widthCm);
  const d = cmToPx(catalogItem.depthCm);

  // ── Keyboard delete (Backspace / Delete) ────────────────────────
  useEffect(() => {
    if (!isSelected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't fire if user is typing in an input/textarea
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        removeFurnitureInstance(instance.id);
        setSelectedItemId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSelected, instance.id, removeFurnitureInstance, setSelectedItemId]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedItemId(instance.id);
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
          y={-16}
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

      {/* Dimension labels inside furniture bounds when selected */}
      {isSelected && (
        <g style={{ pointerEvents: 'none' }}>
          <text
            x={w / 2}
            y={8 / zoom}
            textAnchor="middle"
            dominantBaseline="hanging"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: `${10 / zoom}px`,
              fill: 'var(--color-primary)',
              fontWeight: 600,
            }}
          >
            {Math.round(catalogItem.widthCm)} cm
          </text>
          <text
            x={w - 8 / zoom}
            y={d / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(-90, ${w - 8 / zoom}, ${d / 2})`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: `${10 / zoom}px`,
              fill: 'var(--color-primary)',
              fontWeight: 600,
            }}
          >
            {Math.round(catalogItem.depthCm)} cm
          </text>
        </g>
      )}

      {isSelected && (
        <SelectionHandles
          widthCm={catalogItem.widthCm}
          depthCm={catalogItem.depthCm}
          frontSide={catalogItem.frontSide}
          rotation={instance.rotation}
          zoom={zoom}
          onStartMoveDrag={handleStartMove}
          onRotate90={() => rotateFurniture(instance.id)}
          onRotateToAngle={(a) => rotateFurnitureToAngle(instance.id, a)}
          onDelete={() => { removeFurnitureInstance(instance.id); setSelectedItemId(null); }}
          onDuplicate={() => duplicateFurnitureInstance(instance.id)}
        />
      )}
    </g>
  );
});
