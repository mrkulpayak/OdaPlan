/**
 * Reusable color-picker popover for the toolbar.
 *
 * Shows a palette of preset swatches, a "reset to default" swatch,
 * and a native <input type="color"> for arbitrary colors.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ColorPreset {
  hex: string;
  label: string;
}

interface Props {
  title: string;
  value: string;            // current color hex
  defaultValue: string;     // factory default (for the "Varsayılan" swatch)
  presets: ColorPreset[];
  onChange: (hex: string) => void;
  onClose: () => void;
  /** Position the popover below this anchor (screen px) */
  anchorRect: DOMRect;
}

export function ColorPickerPopover({
  title, value, defaultValue, presets, onChange, onClose, anchorRect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Slight delay so the opening click doesn't immediately close
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  const POPOVER_W = 220;
  const left  = Math.min(Math.max(8, anchorRect.left), window.innerWidth - POPOVER_W - 8);
  const top   = anchorRect.bottom + 6;

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        background: '#fff',
        border: '1px solid var(--color-border)',
        borderRadius: '6px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        padding: '10px',
        width: '220px',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Header */}
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '8px' }}>
        {title}
      </div>

      {/* Preset swatches */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        {/* Factory default swatch (always first) */}
        <SwatchBtn
          hex={defaultValue}
          label="Varsayılan"
          isActive={value === defaultValue}
          onClick={() => onChange(defaultValue)}
          showCheck
        />
        {presets.map((p) => (
          <SwatchBtn
            key={p.hex}
            hex={p.hex}
            label={p.label}
            isActive={value === p.hex}
            onClick={() => onChange(p.hex)}
          />
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--color-border)', margin: '6px 0' }} />

      {/* Custom color row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ fontSize: '11px', color: '#888', flexShrink: 0 }}>Özel:</label>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '32px', height: '26px', padding: '1px 2px',
            border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer',
          }}
        />
        <input
          type="text"
          value={value.toUpperCase()}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
          }}
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            border: '1px solid #ccc',
            borderRadius: '3px',
            padding: '3px 5px',
            textTransform: 'uppercase',
          }}
        />
      </div>
    </div>,
    document.body
  );
}

interface SwatchBtnProps {
  hex: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  showCheck?: boolean;
}

function SwatchBtn({ hex, label, isActive, onClick }: SwatchBtnProps) {
  return (
    <button
      title={label}
      onClick={onClick}
      style={{
        width: '28px',
        height: '28px',
        borderRadius: '4px',
        background: hex,
        border: isActive ? '2px solid var(--color-primary)' : '1.5px solid rgba(0,0,0,0.15)',
        cursor: 'pointer',
        padding: 0,
        position: 'relative',
        outline: 'none',
        flexShrink: 0,
      }}
    >
      {isActive && (
        <span style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', color: isLightColor(hex) ? '#333' : '#fff',
        }}>✓</span>
      )}
    </button>
  );
}

/** Simple luminance check to pick readable checkmark color */
function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
