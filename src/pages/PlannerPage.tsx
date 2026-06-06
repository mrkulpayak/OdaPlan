import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LeftPanel } from '../components/panel/LeftPanel';
import { Canvas } from '../components/canvas/Canvas';
import { CanvasErrorBoundary } from '../components/canvas/CanvasErrorBoundary';
import { Toast } from '../components/ui/Toast';
import { AddProductModal } from '../components/modals/AddProductModal';
import type { AddProductPrefill } from '../components/modals/AddProductModal';
import { supabase } from '../lib/supabase';
import { Download, Printer, RotateCcw, RotateCw, FilePlus, Ruler, Grid3X3, Magnet, LockKeyhole, LockKeyholeOpen, Undo2, Redo2, AlignHorizontalDistributeCenter } from 'lucide-react';
import { ColorPickerPopover } from '../components/ui/ColorPickerPopover';
import type { ColorPreset } from '../components/ui/ColorPickerPopover';
import { useCanvas } from '../hooks/useCanvas';
import { useCatalogStore } from '../store/catalogStore';
import { usePlanStore } from '../store/planStore';
import { useUiStore } from '../store/uiStore';
import { exportToPNG } from '../lib/export';
import { SHAPE_NAMES } from '../lib/customShapes';
import type { FurnitureShapeType } from '../types';

interface Props {
  session: Session;
}

// ── Color presets ──────────────────────────────────────────────────────────
const FURNITURE_DEFAULT = '#f5f0e8';
const FLOOR_DEFAULT     = '#e8dcc8';

const FURNITURE_PRESETS: ColorPreset[] = [
  { hex: '#d4c5a9', label: 'Krem' },
  { hex: '#8b6f47', label: 'Koyu Ahşap' },
  { hex: '#f5f0e8', label: 'Beyaz' },
  { hex: '#4a4a4a', label: 'Antrasit' },
  { hex: '#2c5f8a', label: 'Mavi' },
  { hex: '#3d6b3d', label: 'Yeşil' },
  { hex: '#8b2c2c', label: 'Bordo' },
  { hex: '#6b6b9f', label: 'Lavanta' },
];

const FLOOR_PRESETS: ColorPreset[] = [
  { hex: '#c4935a', label: 'Meşe' },
  { hex: '#a06030', label: 'Ceviz' },
  { hex: '#6b3e26', label: 'Koyu Parke' },
  { hex: '#e8dcc8', label: 'Açık Parke' },
  { hex: '#b0b0b0', label: 'Gri Beton' },
  { hex: '#f0eeea', label: 'Beyaz Fayans' },
  { hex: '#3d3d3d', label: 'Antrasit' },
  { hex: '#a8c4a0', label: 'Açık Yeşil' },
];

export function PlannerPage({ session }: Props) {
  const { rotateView } = useCanvas();
  const loadCatalog = useCatalogStore((s) => s.loadCatalog);
  const resetPlan = usePlanStore((s) => s.resetPlan);
  const undo = usePlanStore((s) => s.undo);
  const redo = usePlanStore((s) => s.redo);
  const canUndo = usePlanStore((s) => s.canUndo);
  const canRedo = usePlanStore((s) => s.canRedo);
  const snapAllWallsStraight = usePlanStore((s) => s.snapAllWallsStraight);
  const room = usePlanStore((s) => s.room);
  const furnitureInstances = usePlanStore((s) => s.furnitureInstances);
  const canvas = usePlanStore((s) => s.canvas);
  const setCanvasState = usePlanStore((s) => s.setCanvasState);
  const addToast = useUiStore((s) => s.addToast);
  const saveCustomShapeId = useUiStore((s) => s.saveCustomShapeId);
  const setSaveCustomShapeId = useUiStore((s) => s.setSaveCustomShapeId);
  const customShapeInstances = usePlanStore((s) => s.customShapeInstances);

  // Color picker popover state
  const [furniturePickerAnchor, setFurniturePickerAnchor] = useState<DOMRect | null>(null);
  const [floorPickerAnchor, setFloorPickerAnchor]         = useState<DOMRect | null>(null);
  const furnitureBtnRef = useRef<HTMLButtonElement>(null);
  const floorBtnRef     = useRef<HTMLButtonElement>(null);

  const handleNewPlan = () => {
    if (window.confirm('Mevcut plan silinecek. Devam edilsin mi?')) {
      resetPlan();
    }
  };

  useEffect(() => {
    loadCatalog(session.user.id);
  }, [session.user.id, loadCatalog]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleExport = async () => {
    const svg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (!svg || !room) {
      addToast({ type: 'warning', message: 'Dışa aktarılacak oda bulunamadı.' });
      return;
    }
    try {
      await exportToPNG(svg, room, furnitureInstances, {
        showDimensions: canvas.showDimensionsOnExport,
        zoom: canvas.zoom,
        panX: canvas.panX,
        panY: canvas.panY,
      });
      addToast({ type: 'success', message: 'Dışa aktarıldı.' });
    } catch {
      addToast({ type: 'error', message: 'Dışa aktarma başarısız. Tekrar deneyin.' });
    }
  };

  const isMeasureMode = useUiStore((s) => s.isMeasureMode);
  const setMeasureMode = useUiStore((s) => s.setMeasureMode);


  const toggleGrid = () => {
    setCanvasState({ showGrid: !canvas.showGrid });
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
          <button title="Geri Al (Ctrl+Z)" onClick={undo} disabled={!canUndo} className={btnCls} style={{ minWidth: '44px', minHeight: '44px', opacity: canUndo ? 1 : 0.35 }}>
            <Undo2 size={16} />
          </button>
          <button title="Yinele (Ctrl+Y)" onClick={redo} disabled={!canRedo} className={btnCls} style={{ minWidth: '44px', minHeight: '44px', opacity: canRedo ? 1 : 0.35 }}>
            <Redo2 size={16} />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button title="Sola Döndür" onClick={() => rotateView('ccw')} className={btnCls} style={{ minWidth: '44px', minHeight: '44px' }}>
            <RotateCcw size={16} />
          </button>
          <button title="Sağa Döndür" onClick={() => rotateView('cw')} className={btnCls} style={{ minWidth: '44px', minHeight: '44px' }}>
            <RotateCw size={16} />
          </button>
          <button title="Yeni Plan" onClick={handleNewPlan} className={btnCls} style={{ minWidth: '44px', minHeight: '44px' }}>
            <FilePlus size={16} />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Measure tool */}
          <button
            title={isMeasureMode ? 'Cetveli Kapat' : 'Cetvel — iki nokta arası ölç'}
            onClick={() => setMeasureMode(!isMeasureMode)}
            className={btnCls}
            style={{
              minWidth: '44px', minHeight: '44px',
              color: isMeasureMode ? 'var(--color-primary)' : undefined,
            }}
          >
            <Ruler size={16} />
          </button>

          <button
            title="Tüm Duvarları Hizala"
            onClick={() => snapAllWallsStraight()}
            className={btnCls}
            style={{ minWidth: '44px', minHeight: '44px' }}
            disabled={!room}
          >
            <AlignHorizontalDistributeCenter size={16} />
          </button>

          <button title="PNG İndir" onClick={handleExport} className={btnCls} style={{ minWidth: '44px', minHeight: '44px' }}>
            <Download size={16} />
          </button>
          <button title="Yazdır" onClick={() => window.print()} className={btnCls} style={{ minWidth: '44px', minHeight: '44px' }}>
            <Printer size={16} />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* ── Furniture color ── */}
          <button
            ref={furnitureBtnRef}
            title="Mobilya Rengi"
            onClick={() => {
              if (furniturePickerAnchor) { setFurniturePickerAnchor(null); return; }
              setFloorPickerAnchor(null);
              setFurniturePickerAnchor(furnitureBtnRef.current!.getBoundingClientRect());
            }}
            className={btnCls}
            style={{ minWidth: '40px', minHeight: '44px', gap: '3px', flexDirection: 'column', padding: '6px 8px' }}
          >
            {/* Small sofa icon built from shapes */}
            <svg width="18" height="14" viewBox="0 0 18 14">
              <rect x="1" y="5" width="16" height="8" rx="1.5" fill={canvas.furnitureColor} stroke="currentColor" strokeWidth="1.2" />
              <rect x="3" y="3" width="12" height="5" rx="1" fill={canvas.furnitureColor} stroke="currentColor" strokeWidth="1" />
              <rect x="1" y="5" width="3" height="6" rx="1" fill={canvas.furnitureColor} stroke="currentColor" strokeWidth="1" />
              <rect x="14" y="5" width="3" height="6" rx="1" fill={canvas.furnitureColor} stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>

          {/* ── Floor color ── */}
          <button
            ref={floorBtnRef}
            title="Zemin Rengi"
            onClick={() => {
              if (floorPickerAnchor) { setFloorPickerAnchor(null); return; }
              setFurniturePickerAnchor(null);
              setFloorPickerAnchor(floorBtnRef.current!.getBoundingClientRect());
            }}
            className={btnCls}
            style={{ minWidth: '40px', minHeight: '44px', padding: '6px 8px' }}
          >
            {/* Floor tile icon */}
            <svg width="18" height="16" viewBox="0 0 18 16">
              <rect x="1" y="1" width="16" height="14" rx="1" fill={canvas.floorColor} stroke="currentColor" strokeWidth="1.2" />
              <line x1="9" y1="1" x2="9" y2="15" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.5" />
              <line x1="1" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.5" />
            </svg>
          </button>

          {/* ── Grid toggle ── */}
          <button
            title={canvas.showGrid ? 'Gridi Gizle' : 'Grid Göster (50 cm)'}
            onClick={toggleGrid}
            className={btnCls}
            style={{
              minWidth: '44px', minHeight: '44px',
              color: canvas.showGrid ? 'var(--color-primary)' : undefined,
            }}
          >
            <Grid3X3 size={16} />
          </button>

          {/* ── Walls lock toggle ── */}
          <button
            title={canvas.wallsLocked ? 'Duvarları Aç' : 'Tüm Duvarları Kilitle'}
            onClick={() => setCanvasState({ wallsLocked: !canvas.wallsLocked })}
            className={btnCls}
            style={{
              minWidth: '44px', minHeight: '44px',
              color: canvas.wallsLocked ? 'var(--color-primary)' : undefined,
            }}
          >
            {canvas.wallsLocked ? <LockKeyhole size={16} /> : <LockKeyholeOpen size={16} />}
          </button>

          {/* ── Snap toggle ── */}
          <button
            title={canvas.snapEnabled !== false ? 'Snap Kapat' : 'Snap Aç'}
            onClick={() => setCanvasState({ snapEnabled: canvas.snapEnabled === false })}
            className={btnCls}
            style={{
              minWidth: '44px', minHeight: '44px',
              color: canvas.snapEnabled !== false ? 'var(--color-primary)' : undefined,
            }}
          >
            <Magnet size={16} />
          </button>

          <div className="w-px h-5 bg-border mx-1" />
          <button
            onClick={handleLogout}
            className="text-sm text-text-muted hover:text-[var(--color-text)] cursor-pointer transition-colors duration-fast px-3 py-1 rounded hover:bg-surface-alt"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Çıkış
          </button>
        </div>
      </div>

      {/* ── Color picker popovers ── */}
      {furniturePickerAnchor && (
        <ColorPickerPopover
          title="Mobilya Rengi"
          value={canvas.furnitureColor}
          defaultValue={FURNITURE_DEFAULT}
          presets={FURNITURE_PRESETS}
          onChange={(hex) => setCanvasState({ furnitureColor: hex })}
          onClose={() => setFurniturePickerAnchor(null)}
          anchorRect={furniturePickerAnchor}
        />
      )}
      {floorPickerAnchor && (
        <ColorPickerPopover
          title="Zemin Rengi"
          value={canvas.floorColor}
          defaultValue={FLOOR_DEFAULT}
          presets={FLOOR_PRESETS}
          onChange={(hex) => setCanvasState({ floorColor: hex })}
          onClose={() => setFloorPickerAnchor(null)}
          anchorRect={floorPickerAnchor}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel dealerId={session.user.id} />
        <CanvasErrorBoundary>
          <Canvas />
        </CanvasErrorBoundary>
      </div>

      {/* Toast container */}
      <Toast />

      {/* Save custom shape → AddProductModal (triggered from canvas shape editor) */}
      {saveCustomShapeId && (() => {
        const cs = customShapeInstances.find((s) => s.id === saveCustomShapeId);
        if (!cs) return null;
        // Map custom shape type → closest FurnitureShapeType
        const shapeTypeMap: Record<string, FurnitureShapeType> = {
          rect: 'rectangle',
          'l-shape': 'rectangle',
          chamfered: 'chamferedRectangle',
        };
        const prefill: AddProductPrefill = {
          name: cs.name ?? SHAPE_NAMES[cs.shapeType],
          widthCm: Math.round(cs.dims.A),
          depthCm: Math.round(cs.dims.B),
          shapeType: shapeTypeMap[cs.shapeType] ?? 'rectangle',
          chamferCm: cs.shapeType === 'chamfered' ? Math.round(cs.dims.C) : undefined,
        };
        return (
          <AddProductModal
            dealerId={session.user.id}
            prefill={prefill}
            onClose={() => setSaveCustomShapeId(null)}
          />
        );
      })()}
    </div>
  );
}
