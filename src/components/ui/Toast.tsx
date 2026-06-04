import { useEffect } from 'react';
import { useUiStore } from '../../store/uiStore';
import { X } from 'lucide-react';

const TYPE_COLORS = {
  success: { bg: '#2ecc71', border: '#27ae60' },
  warning: { bg: '#f39c12', border: '#e67e22' },
  error:   { bg: '#e74c3c', border: '#c0392b' },
};

function ToastItem({ id, type, message }: { id: string; type: 'success' | 'warning' | 'error'; message: string }) {
  const removeToast = useUiStore((s) => s.removeToast);
  const colors = TYPE_COLORS[type];

  useEffect(() => {
    const t = setTimeout(() => removeToast(id), 3000);
    return () => clearTimeout(t);
  }, [id, removeToast]);

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded shadow-lg min-w-0"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: '#fff',
        fontFamily: 'var(--font-body)',
        fontSize: '13px',
        maxWidth: '320px',
        lineHeight: 1.4,
        animation: 'toast-in 0.15s ease-out',
      }}
    >
      <span className="flex-1 break-words">{message}</span>
      <button
        onClick={() => removeToast(id)}
        className="cursor-pointer shrink-0 opacity-80 hover:opacity-100 transition-opacity"
        style={{ color: '#fff', lineHeight: 1 }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Toast() {
  const toasts = useUiStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        className="fixed flex flex-col gap-2 z-50"
        style={{ bottom: '24px', right: '24px', pointerEvents: 'none' }}
      >
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem id={t.id} type={t.type} message={t.message} />
          </div>
        ))}
      </div>
    </>
  );
}
