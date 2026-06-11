import { useState, useEffect, useRef } from 'react';

interface Props {
  value: number;
  min?: number;
  max?: number;
  onLiveChange: (v: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Number input with live preview that stays editable.
 *
 * The field holds its own text state, so the user can clear it or type
 * intermediate values like "1" without the store value snapping back in.
 * Valid values (within min/max) are applied live on every keystroke;
 * invalid/empty text is kept locally only. On blur or Enter the display
 * resyncs to the last applied value.
 */
export function LiveDimInput({ value, min = 5, max, onLiveChange, className, style }: Props) {
  const [text, setText] = useState(String(value));
  const focusedRef = useRef(false);

  // External changes (canvas drag-resize, undo) update the field while not editing
  useEffect(() => {
    if (!focusedRef.current) setText(String(value));
  }, [value]);

  return (
    <input
      type="number"
      min={min}
      max={max}
      value={text}
      onFocus={() => { focusedRef.current = true; }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const v = parseFloat(raw);
        if (!Number.isNaN(v) && v >= min && (max === undefined || v <= max)) {
          onLiveChange(v);
        }
      }}
      onBlur={() => {
        focusedRef.current = false;
        setText(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={className}
      style={style}
    />
  );
}
