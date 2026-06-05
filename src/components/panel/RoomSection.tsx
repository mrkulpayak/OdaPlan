import { memo, useRef, useEffect } from 'react';
import { usePlanStore, type RoomTemplate } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { PenLine } from 'lucide-react';

const templates: { type: RoomTemplate; label: string; path: string }[] = [
  {
    type: 'rectangle',
    label: 'Dikdörtgen',
    path: 'M2,2 L38,2 L38,28 L2,28 Z',
  },
  {
    type: 'square',
    label: 'Kare',
    path: 'M5,2 L35,2 L35,28 L5,28 Z',
  },
  {
    type: 'l-shape',
    label: 'L-Shape',
    path: 'M2,2 L38,2 L38,16 L22,16 L22,28 L2,28 Z',
  },
  {
    type: 'niche',
    label: 'Girintili',
    path: 'M2,2 L38,2 L38,28 L26,28 L26,18 L14,18 L14,28 L2,28 Z',
  },
  {
    type: 'column',
    label: 'Kolonlu',
    path: 'M2,2 L38,2 L38,28 L2,28 Z',
  },
  {
    type: 'angled',
    label: 'Köşeli Duvar',
    path: 'M2,2 L32,2 L38,10 L38,28 L2,28 Z',
  },
];

export const RoomSection = memo(function RoomSection() {
  const createRoomFromTemplate = usePlanStore((s) => s.createRoomFromTemplate);
  const fitRoomToCanvas = usePlanStore((s) => s.fitRoomToCanvas);
  const isDrawingMode = useUiStore((s) => s.isDrawingMode);
  const setDrawingMode = useUiStore((s) => s.setDrawingMode);
  const canvasRef = useRef<{ width: number; height: number }>({ width: 800, height: 600 });

  useEffect(() => {
    const canvas = document.getElementById('canvas');
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      canvasRef.current = { width: r.width, height: r.height };
    }
  }, []);

  const handleSelect = (type: RoomTemplate) => {
    const svg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    const r = svg?.getBoundingClientRect();
    const w = r?.width || window.innerWidth - 280;
    const h = r?.height || window.innerHeight - 48;
    createRoomFromTemplate(type);
    fitRoomToCanvas(w, h);
  };

  return (
    <div className="p-3">
      <p className="text-xs text-text-muted mb-2" style={{ fontFamily: 'var(--font-body)' }}>
        Başlamak için bir şablon seçin
      </p>
      <button
        onClick={() => setDrawingMode(!isDrawingMode)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded border cursor-pointer transition-colors duration-fast mb-3"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '13px',
          background: isDrawingMode ? 'var(--color-primary)' : 'var(--color-surface)',
          color: isDrawingMode ? '#fff' : 'var(--color-text)',
          borderColor: isDrawingMode ? 'var(--color-primary)' : 'var(--color-border)',
        }}
      >
        <PenLine size={14} />
        {isDrawingMode ? 'Çizimi iptal et' : 'Özel oda çiz'}
      </button>
      <div className="grid grid-cols-2 gap-2">
        {templates.map((t) => (
          <button
            key={t.type}
            onClick={() => handleSelect(t.type)}
            className="flex flex-col items-center gap-1 p-2 rounded border border-border hover:border-primary hover:bg-surface-alt cursor-pointer transition-colors duration-fast"
            style={{ background: 'var(--color-surface)' }}
          >
            <svg width="40" height="30" viewBox="0 0 40 30">
              <path
                d={t.path}
                fill="var(--color-furniture-fill)"
                stroke="var(--color-room-outline)"
                strokeWidth={1.5}
              />
            </svg>
            <span
              className="text-xs text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
});
