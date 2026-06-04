import { memo } from 'react';
import { cmToPx } from '../../lib/geometry';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';

interface Props {
  instanceId: string;
  widthCm: number;
  depthCm: number;
  onStartMoveDrag: (e: React.PointerEvent) => void;
}

const HANDLE_SIZE = 20; // px in SVG space (will be scaled by zoom, target 44px at zoom=1)

export const SelectionHandles = memo(function SelectionHandles({ instanceId, widthCm, depthCm, onStartMoveDrag }: Props) {
  const removeFurnitureInstance = usePlanStore((s) => s.removeFurnitureInstance);
  const rotateFurniture = usePlanStore((s) => s.rotateFurniture);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);

  const w = cmToPx(widthCm);
  const d = cmToPx(depthCm);
  const h = HANDLE_SIZE;
  const r = h / 2;

  const handleDelete = (e: React.PointerEvent) => {
    e.stopPropagation();
    removeFurnitureInstance(instanceId);
    setSelectedItemId(null);
  };

  const handleRotate = (e: React.PointerEvent) => {
    e.stopPropagation();
    rotateFurniture(instanceId);
  };

  return (
    <g>
      {/* Drag area over furniture body */}
      <rect
        x={0} y={0} width={w} height={d}
        fill="transparent"
        style={{ cursor: 'move' }}
        onPointerDown={onStartMoveDrag}
      />

      {/* Delete handle — top-left */}
      <g
        transform={`translate(${-r}, ${-r})`}
        style={{ cursor: 'pointer' }}
        onPointerDown={handleDelete}
        role="button"
        aria-label="Delete furniture"
      >
        <circle cx={r} cy={r} r={r} fill="var(--color-error, #e74c3c)" />
        <line x1={r - 4} y1={r - 4} x2={r + 4} y2={r + 4} stroke="#fff" strokeWidth={1.5} />
        <line x1={r + 4} y1={r - 4} x2={r - 4} y2={r + 4} stroke="#fff" strokeWidth={1.5} />
      </g>

      {/* Rotate handle — top-right */}
      <g
        transform={`translate(${w - r}, ${-r})`}
        style={{ cursor: 'pointer' }}
        onPointerDown={handleRotate}
        role="button"
        aria-label="Rotate furniture 90°"
      >
        <circle cx={r} cy={r} r={r} fill="var(--color-primary)" />
        {/* Simple rotate arc icon */}
        <path
          d={`M ${r - 4} ${r} A 4 4 0 0 1 ${r + 3} ${r - 3}`}
          fill="none"
          stroke="#fff"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <polygon points={`${r + 3},${r - 6} ${r + 6},${r - 3} ${r + 3},${r - 3}`} fill="#fff" />
      </g>
    </g>
  );
});
