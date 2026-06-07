import { memo, useState, useRef, useEffect } from 'react';
import { Lock, Unlock, Pin, PinOff } from 'lucide-react';
import type { Point } from '../../types';

interface Props {
  wallId: string;
  a: Point; // px
  b: Point; // px
  lengthCm: number;
  isLocked: boolean;
  isPinned: boolean;
  /** Outward unit normal in SVG px space — ensures label is always outside the room */
  outwardNormal: Point;
  onCommit: (wallId: string, newLengthCm: number) => void;
  onToggleLock: (wallId: string) => void;
  onTogglePin: (wallId: string) => void;
  viewRotation: number;
  zoom: number;
}

export const DimensionLabel = memo(function DimensionLabel({
  wallId, a, b, lengthCm, isLocked, isPinned, outwardNormal, onCommit, onToggleLock, onTogglePin, viewRotation, zoom,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  const offset = 60;
  const nx = outwardNormal?.x ?? 0;
  const ny = outwardNormal?.y ?? -1;
  const labelX = midX + offset * nx;
  const labelY = midY + offset * ny;

  // Counter-rotate text to stay screen-readable
  const textRotation = -viewRotation;

  const startEdit = () => {
    setInputVal(String(Math.round(lengthCm)));
    setEditing(true);
  };

  const commit = () => {
    const val = parseFloat(inputVal);
    if (!isNaN(val) && val > 0 && val <= 9999) {
      onCommit(wallId, val);
    }
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const fontSize = Math.max(18, Math.min(24, 22 / zoom));

  return (
    <g data-interactive="true" data-dimension-label="true">
      {editing ? (
        <foreignObject
          x={labelX - 40}
          y={labelY - 12}
          width={80}
          height={24}
          style={{ transform: `rotate(${textRotation}deg)`, transformOrigin: `${labelX}px ${labelY}px` }}
        >
          <input
            ref={inputRef}
            type="number"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') cancel();
            }}
            onBlur={commit}
            style={{
              width: '100%',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              border: '1px solid var(--color-primary)',
              borderRadius: '2px',
              padding: '1px 4px',
              textAlign: 'right',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              outline: 'none',
            }}
          />
        </foreignObject>
      ) : (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          onClick={startEdit}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: `${fontSize}px`,
            fill: 'var(--color-text)',
            cursor: 'text',
            userSelect: 'none',
            transform: `rotate(${textRotation}deg)`,
            transformOrigin: `${labelX}px ${labelY}px`,
          }}
        >
          {Math.round(lengthCm)} cm
        </text>
      )}

      {/* Length lock icon */}
      <g
        data-interactive="true"
        transform={`translate(${labelX + 54}, ${labelY - 8}) rotate(${textRotation}, 8, 8)`}
        onClick={() => onToggleLock(wallId)}
        style={{ cursor: 'pointer' }}
      >
        <rect width={16} height={16} fill="transparent" />
        {isLocked ? (
          <Lock size={14} color="var(--color-accent)" style={{ display: 'block' }} />
        ) : (
          <Unlock size={14} color="var(--color-text-muted)" style={{ display: 'block' }} />
        )}
      </g>

      {/* Pin icon — fully anchors the wall in space */}
      <g
        data-interactive="true"
        transform={`translate(${labelX + 74}, ${labelY - 8}) rotate(${textRotation}, 8, 8)`}
        onClick={() => onTogglePin(wallId)}
        style={{ cursor: 'pointer' }}
      >
        <rect width={14} height={14} fill="transparent" />
        {isPinned ? (
          <Pin size={14} color="#ef4444" style={{ display: 'block' }} />
        ) : (
          <PinOff size={14} color="var(--color-text-muted)" style={{ display: 'block' }} />
        )}
      </g>
    </g>
  );
});
