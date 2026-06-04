import { memo } from 'react';
import { cmToPx } from '../../lib/geometry';
import { useUiStore } from '../../store/uiStore';
import { useDrag } from '../../hooks/useDrag';
import { FurnitureShape } from './FurnitureShape';
import { SelectionHandles } from './SelectionHandles';
import type { FurnitureInstance, FurnitureCatalogItem } from '../../types';

interface Props {
  instance: FurnitureInstance;
  catalogItem: FurnitureCatalogItem;
}

export const FurnitureItem = memo(function FurnitureItem({ instance, catalogItem }: Props) {
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);
  const { startMoveDrag } = useDrag();

  const isSelected = selectedItemId === instance.id;

  const x = cmToPx(instance.position.x);
  const y = cmToPx(instance.position.y);
  const w = cmToPx(catalogItem.widthCm);
  const d = cmToPx(catalogItem.depthCm);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedItemId(instance.id);
  };

  const handleStartMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    startMoveDrag(e, instance, catalogItem);
  };

  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${instance.rotation}, ${w / 2}, ${d / 2})`}
      onPointerDown={handlePointerDown}
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
