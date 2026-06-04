import { memo, useState, useRef, useEffect } from 'react';
import { Lock, Unlock } from 'lucide-react';
import type { Point } from '../../types';
import { segmentAngleDegrees } from '../../lib/geometry';

interface Props {
  wallId: string;
  a: Point; // px
  b: Point; // px
  lengthCm: number;
  isLocked: boolean;
  onCommit: (wallId: string, newLengthCm: number) => void;
  onToggleLock: (wallId: string) => void;
  viewRotation: number;
  zoom: number;
}

export const DimensionLabel = memo(function DimensionLabel({
  wallId, a, b, lengthCm, isLocked, onCommit, onToggleLock, viewRotation, zoom,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  const wallAngle = segmentAngleDegrees(a, b);
  // Perpendicular offset direction (outward)
  const perpAngle = wallAngle - 90;
  const perpRad = (perpAngle * Math.PI) / 180;
  const offset = 18;
  const labelX = midX + offset * Math.cos(perpRad);
  const labelY = midY + offset * Math.sin(perpRad);

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

  const fontSize = Math.max(9, Math.min(12, 11 / zoom));

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

      {/* Lock icon */}
      <g
        data-interactive="true"
        transform={`translate(${labelX + 28}, ${labelY - 6}) rotate(${textRotation}, 6, 6)`}
        onClick={() => onToggleLock(wallId)}
        style={{ cursor: 'pointer' }}
      >
        <rect width={14} height={14} fill="transparent" />
        {isLocked ? (
          <Lock
            size={12}
            color="var(--color-accent)"
            style={{ display: 'block' }}
          />
        ) : (
          <Unlock
            size={12}
            color="var(--color-text-muted)"
            style={{ display: 'block' }}
          />
        )}
      </g>
    </g>
  );
});
