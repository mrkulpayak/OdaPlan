import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LeftPanel } from '../components/panel/LeftPanel';
import { Canvas } from '../components/canvas/Canvas';
import { CanvasErrorBoundary } from '../components/canvas/CanvasErrorBoundary';
import { Toast } from '../components/ui/Toast';
import { supabase } from '../lib/supabase';
import { Download, Printer, RotateCcw, RotateCw, FilePlus, Ruler } from 'lucide-react';
import { useCanvas } from '../hooks/useCanvas';
import { useCatalogStore } from '../store/catalogStore';
import { usePlanStore } from '../store/planStore';
import { useUiStore } from '../store/uiStore';
import { exportToPNG } from '../lib/export';

interface Props {
  session: Session;
}

export function PlannerPage({ session }: Props) {
  const { rotateView } = useCanvas();
  const loadCatalog = useCatalogStore((s) => s.loadCatalog);
  const resetPlan = usePlanStore((s) => s.resetPlan);
  const room = usePlanStore((s) => s.room);
  const furnitureInstances = usePlanStore((s) => s.furnitureInstances);
  const canvas = usePlanStore((s) => s.canvas);
  const setCanvasState = usePlanStore((s) => s.setCanvasState);
  const addToast = useUiStore((s) => s.addToast);

  const handleNewPlan = () => {
    if (window.confirm('This will clear the current plan. Continue?')) {
      resetPlan();
    }
  };

  useEffect(() => {
    loadCatalog(session.user.id);
  }, [session.user.id, loadCatalog]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleExport = async () => {
    const svg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (!svg || !room) {
      addToast({ type: 'warning', message: 'No room to export.' });
      return;
    }
    try {
      await exportToPNG(svg, room, furnitureInstances, {
        showDimensions: canvas.showDimensionsOnExport,
        zoom: canvas.zoom,
        panX: canvas.panX,
        panY: canvas.panY,
      });
      addToast({ type: 'success', message: 'Exported.' });
    } catch {
      addToast({ type: 'error', message: 'Export failed. Try again.' });
    }
  };

  const toggleDimensions = () => {
    setCanvasState({ showDimensionsOnExport: !canvas.showDimensionsOnExport });
  };

  const btnCls = 'flex items-center justify-center rounded hover:bg-surface-alt text-text-muted hover:text-[var(--color-text)] cursor-pointer transition-colors duration-fast';

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* Toolbar */}
      <div
        id="toolbar"
        className="flex items-center justify-between px-4 border-b border-border bg-surface"
        style={{ height: '48px', flexShrink: 0 }}
      >
        <span
          className="text-base font-semibold text-[var(--color-text)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          OdaPlan
        </span>

        <div className="flex items-center gap-1">
          <button title="Rotate counter-clockwise" onClick={() => rotateView('ccw')} className={btnCls} style={{ minWidth: '44px', minHeight: '44px' }}>
            <RotateCcw size={16} />
          </button>
          <button title="Rotate clockwise" onClick={() => rotateView('cw')} className={btnCls} style={{ minWidth: '44px', minHeight: '44px' }}>
            <RotateCw size={16} />
          </button>
          <button title="New Plan" onClick={handleNewPlan} className={btnCls} style={{ minWidth: '44px', minHeight: '44px' }}>
            <FilePlus size={16} />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Dimension toggle */}
          <button
            title={canvas.showDimensionsOnExport ? 'Hide dimensions on export' : 'Show dimensions on export'}
            onClick={toggleDimensions}
            className={btnCls}
            style={{
              minWidth: '44px', minHeight: '44px',
              color: canvas.showDimensionsOnExport ? 'var(--color-primary)' : undefined,
            }}
          >
            <Ruler size={16} />
          </button>

          <button title="Download PNG" onClick={handleExport} className={btnCls} style={{ minWidth: '44px', minHeight: '44px' }}>
            <Download size={16} />
          </button>
          <button title="Print" onClick={() => window.print()} className={btnCls} style={{ minWidth: '44px', minHeight: '44px' }}>
            <Printer size={16} />
          </button>

          <div className="w-px h-5 bg-border mx-1" />
          <button
            onClick={handleLogout}
            className="text-sm text-text-muted hover:text-[var(--color-text)] cursor-pointer transition-colors duration-fast px-3 py-1 rounded hover:bg-surface-alt"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel dealerId={session.user.id} />
        <CanvasErrorBoundary>
          <Canvas />
        </CanvasErrorBoundary>
      </div>

      {/* Toast container */}
      <Toast />
    </div>
  );
}
