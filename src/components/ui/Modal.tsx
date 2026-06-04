import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ title, onClose, children, footer }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onPointerDown={onClose}
    >
      <div
        className="flex flex-col rounded border border-border"
        style={{
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-modal, 0 8px 32px rgba(0,0,0,0.18))',
          width: '480px',
          maxWidth: '95vw',
          maxHeight: '90vh',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 border-b border-border"
          style={{ height: '48px', flexShrink: 0 }}
        >
          <span
            className="text-sm font-semibold text-[var(--color-text)]"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-[var(--color-text)] cursor-pointer transition-colors duration-fast text-lg leading-none"
            style={{ fontFamily: 'var(--font-body)' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border" style={{ flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
