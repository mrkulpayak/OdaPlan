import { memo, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cmToPx, pxToCm } from '../../lib/geometry';
import { useUiStore } from '../../store/uiStore';
import { usePlanStore } from '../../store/planStore';
import { computeSnap } from '../../hooks/useSnap';
import { useCatalogStore } from '../../store/catalogStore';
import { SelectionHandles } from './SelectionHandles';
import { RadialRotateMenu } from './RadialRotateMenu';
import {
  shapePolygonCm,
  polygonToSVGPoints,
  shapeBBox,
  shapeEdgeAnnotations,
  DIM_KEYS,
  DIM_LABELS,
  SHAPE_NAMES,
} from '../../lib/customShapes';
import type { CustomShapeInstance, FurnitureCatalogItem } from '../../types';

const DRAG_THRESHOLD_PX = 4;

interface Props {
  instance: CustomShapeInstance;
  zoom: number;
}

/** Build a fake FurnitureCatalogItem from bounding box — used for computeSnap */
function mockCatalogItem(dims: Record<string, number>): FurnitureCatalogItem {
  const bbox = shapeBBox(dims);
  return {
    id: '__custom__',
    dealerId: null,
    companyId: '__custom__',
    modelId: null,
    name: 'Custom',
    category: 'Özel',
    shapeType: 'rectangle',
    frontSide: 'bottom',
    widthCm: bbox.w,
    depthCm: bbox.h,
    params: null,
    isGlobal: false,
  };
}

export const CustomShapeItem = memo(function CustomShapeItem({ instance, zoom }: Props) {
  const selectedItemId        = useUiStore((s) => s.selectedItemId);
  const setSelectedItemId     = useUiStore((s) => s.setSelectedItemId);
  const setSaveCustomShapeId  = useUiStore((s) => s.setSaveCustomShapeId);
  const updateCustomShapeInstance  = usePlanStore((s) => s.updateCustomShapeInstance);
  const removeCustomShapeInstance  = usePlanStore((s) => s.removeCustomShapeInstance);
  const rotateCustomShape            = usePlanStore((s) => s.rotateCustomShape);
  const duplicateCustomShapeInstance = usePlanStore((s) => s.duplicateCustomShapeInstance);

  const isSelected = selectedItemId === instance.id;

  const [isEditing, setIsEditing] = useState(false);
  const [editDims, setEditDims]   = useState<Record<string, number>>(instance.dims);
  const [radialActive, setRadialActive] = useState(false);
  const [radialAngle,  setRadialAngle]  = useState(0);
  const originalAngleRef = useRef(0);
  // Panel position in viewport coords (fixed)
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const panelDragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Sync editDims when dims change externally
  useEffect(() => {
    setEditDims(instance.dims);
  }, [instance.dims]);

  // Close editor/radial when deselected
  useEffect(() => {
    if (!isSelected) { setIsEditing(false); setRadialActive(false); }
  }, [isSelected]);

  // ── Keyboard delete ───────────────────────────────────────────
  useEffect(() => {
    if (!isSelected || isEditing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        removeCustomShapeInstance(instance.id);
        setSelectedItemId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSelected, isEditing, instance.id, removeCustomShapeInstance, setSelectedItemId]);

  // ── Geometry ──────────────────────────────────────────────────
  const bbox = shapeBBox(instance.dims);
  const x = cmToPx(instance.position.x);
  const y = cmToPx(instance.position.y);
  const wPx = cmToPx(bbox.w);
  const hPx = cmToPx(bbox.h);

  const ptsCm  = shapePolygonCm(instance.shapeType, instance.dims);
  const ptsStr = polygonToSVGPoints(ptsCm, cmToPx);

  // ── Drag-to-move ──────────────────────────────────────────────
  const pendingDragRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef  = useRef(false);
  const dragOffsetRef  = useRef({ x: bbox.w / 2, y: bbox.h / 2 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedItemId(instance.id);
    setIsEditing(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    pendingDragRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current  = false;

    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (canvasSvg) {
      const r = canvasSvg.getBoundingClientRect();
      const cs = usePlanStore.getState().canvas;
      const cmX = pxToCm((e.clientX - r.left - cs.panX) / cs.zoom);
      const cmY = pxToCm((e.clientY - r.top  - cs.panY) / cs.zoom);
      dragOffsetRef.current = {
        x: cmX - instance.position.x,
        y: cmY - instance.position.y,
      };
    }
  }, [instance.id, instance.position, setSelectedItemId]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pendingDragRef.current) return;
    e.stopPropagation();

    if (!isDraggingRef.current) {
      const dx = e.clientX - pendingDragRef.current.x;
      const dy = e.clientY - pendingDragRef.current.y;
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
      isDraggingRef.current = true;
      usePlanStore.getState().saveSnapshot();
    }

    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (!canvasSvg) return;
    const r  = canvasSvg.getBoundingClientRect();
    const cs = usePlanStore.getState().canvas;
    const cmX = pxToCm((e.clientX - r.left - cs.panX) / cs.zoom);
    const cmY = pxToCm((e.clientY - r.top  - cs.panY) / cs.zoom);
    const pos = { x: cmX - dragOffsetRef.current.x, y: cmY - dragOffsetRef.current.y };

    const state = usePlanStore.getState();
    const { products } = useCatalogStore.getState();
    const itemMap = new Map(products.map((p) => [p.id, p]));
    const fakeItem = mockCatalogItem(instance.dims);
    const snapRoom = state.canvas.snapEnabled !== false ? state.room : null;
    const snap = computeSnap(pos, fakeItem, snapRoom, state.furnitureInstances, itemMap, instance.rotation);

    updateCustomShapeInstance(instance.id, { position: snap.position });
  }, [instance.id, instance.dims, instance.rotation, updateCustomShapeInstance]);

  const handlePointerUp = useCallback(() => {
    pendingDragRef.current = null;
    isDraggingRef.current  = false;
  }, []);

  // ── Double-click: open dimension editor ───────────────────────
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItemId(instance.id);
    const editorW = 200;
    const editorH = DIM_KEYS[instance.shapeType].length * 36 + 72;
    // Position panel near the click, keeping it within viewport
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const px = Math.min(e.clientX + 16, vpW - editorW - 16);
    const py = Math.min(e.clientY - editorH / 2, vpH - editorH - 16);
    setPanelPos({ x: Math.max(8, px), y: Math.max(8, py) });
    setIsEditing(true);
  }, [instance.id, instance.shapeType, setSelectedItemId]);

  // ── Start-move callback for SelectionHandles drag handle ──────
  const handleStartMove = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    pendingDragRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current  = true;
    e.currentTarget.setPointerCapture(e.pointerId);

    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (canvasSvg) {
      const r  = canvasSvg.getBoundingClientRect();
      const cs = usePlanStore.getState().canvas;
      const cmX = pxToCm((e.clientX - r.left - cs.panX) / cs.zoom);
      const cmY = pxToCm((e.clientY - r.top  - cs.panY) / cs.zoom);
      dragOffsetRef.current = {
        x: cmX - instance.position.x,
        y: cmY - instance.position.y,
      };
    }
  }, [instance.position]);

  // ── Dimension editor commit ───────────────────────────────────
  const commitEdit = useCallback(() => {
    updateCustomShapeInstance(instance.id, { dims: editDims });
    setIsEditing(false);
  }, [instance.id, editDims, updateCustomShapeInstance]);

  const handleDimChange = useCallback((key: string, raw: string) => {
    const v = parseFloat(raw);
    if (!Number.isNaN(v) && v >= 5) {
      setEditDims((prev) => {
        const next = { ...prev, [key]: v };
        // Live preview: update the shape in real-time
        updateCustomShapeInstance(instance.id, { dims: next });
        return next;
      });
    }
  }, [instance.id, updateCustomShapeInstance]);

  // ── Panel drag handlers (header drag-to-move) ─────────────────
  const handlePanelDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    panelDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      ox: panelPos?.x ?? 0,
      oy: panelPos?.y ?? 0,
    };
  }, [panelPos]);

  const handlePanelDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panelDragRef.current) return;
    const dx = e.clientX - panelDragRef.current.startX;
    const dy = e.clientY - panelDragRef.current.startY;
    setPanelPos({ x: panelDragRef.current.ox + dx, y: panelDragRef.current.oy + dy });
  }, []);

  const handlePanelDragEnd = useCallback(() => {
    panelDragRef.current = null;
  }, []);

  // ── Dimension editor foreignObject ────────────────────────────
  const editorW = 200;   // px

  const annotations = shapeEdgeAnnotations(instance.shapeType, instance.dims);
  const labelOffset = 14; // px offset from edge midpoint

  return (
    <>
    <g
      transform={`translate(${x}, ${y}) rotate(${instance.rotation}, ${wPx / 2}, ${hPx / 2})`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: isSelected ? 'default' : 'pointer' }}
    >
      {/* Shape fill */}
      <polygon
        points={ptsStr}
        fill="var(--color-furniture-fill)"
        fillOpacity={0.82}
        stroke="var(--color-furniture-border)"
        strokeWidth={1.5 / zoom}
      />

      {/* Selection outline */}
      {isSelected && (
        <polygon
          points={ptsStr}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={1.5 / zoom}
          strokeDasharray={`${4 / zoom} ${3 / zoom}`}
        />
      )}

      {/* Name label when selected */}
      {isSelected && !isEditing && (
        <text
          x={wPx / 2}
          y={-16 / zoom}
          textAnchor="middle"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: `${11 / zoom}px`,
            fill: 'var(--color-text)',
            pointerEvents: 'none',
          }}
        >
          {instance.name ?? SHAPE_NAMES[instance.shapeType]}
        </text>
      )}

      {/* Edge dimension labels (when selected — including while editing for live feedback) */}
      {isSelected && annotations.map((ann) => (
        <g key={ann.dimKey} style={{ pointerEvents: 'none' }}>
          <text
            x={cmToPx(ann.mx) + ann.nx * labelOffset / zoom}
            y={cmToPx(ann.my) + ann.ny * labelOffset / zoom}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: `${10 / zoom}px`,
              fill: 'var(--color-primary)',
              fontWeight: 600,
            }}
          >
            {ann.label}={Math.round(ann.value)}
          </text>
        </g>
      ))}

      {/* Overlay controls (rotate / delete / duplicate) */}
      {isSelected && !isEditing && (
        <SelectionHandles
          widthCm={bbox.w}
          depthCm={bbox.h}
          rotation={instance.rotation}
          zoom={zoom}
          radialActive={radialActive}
          onStartMoveDrag={handleStartMove}
          onRotate90={() => rotateCustomShape(instance.id)}
          onDelete={() => { removeCustomShapeInstance(instance.id); setSelectedItemId(null); }}
          onDuplicate={() => duplicateCustomShapeInstance(instance.id)}
          onOpenRadial={() => {
            originalAngleRef.current = instance.rotation;
            setRadialAngle(instance.rotation);
            setRadialActive(true);
          }}
        />
      )}

    </g>

    {/* Radial rotate menu — outside the rotate group so it stays upright */}
    {isSelected && radialActive && (() => {
      const xPx = cmToPx(x + bbox.w / 2);
      const yPx = cmToPx(y + bbox.h / 2);
      return (
        <RadialRotateMenu
          cx={xPx} cy={yPx}
          currentAngle={radialAngle}
          originalAngle={originalAngleRef.current}
          zoom={zoom}
          onAngleChange={(ang) => {
            setRadialAngle(ang);
            updateCustomShapeInstance(instance.id, { rotation: ang });
          }}
          onConfirm={() => setRadialActive(false)}
          onCancel={() => {
            updateCustomShapeInstance(instance.id, { rotation: originalAngleRef.current });
            setRadialActive(false);
          }}
        />
      );
    })()}

    {/* ── Dimension editor — portal to body, fixed position ─────── */}
    {isEditing && panelPos && createPortal(
      <div
        style={{
          position: 'fixed',
          left: panelPos.x,
          top: panelPos.y,
          width: `${editorW}px`,
          background: '#fff',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          fontFamily: 'var(--font-body)',
          zIndex: 9999,
          userSelect: 'none',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {/* Draggable header */}
        <div
          onPointerDown={handlePanelDragStart}
          onPointerMove={handlePanelDragMove}
          onPointerUp={handlePanelDragEnd}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 10px 6px',
            cursor: 'grab',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text)' }}>
            {SHAPE_NAMES[instance.shapeType]} — Ölçüler
          </span>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setIsEditing(false); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#999', lineHeight: 1 }}
          >×</button>
        </div>

        {/* Dim inputs */}
        <div style={{ padding: '8px 10px 6px' }}>
          {DIM_KEYS[instance.shapeType].map((key) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <span style={{
                width: '18px', textAlign: 'center', fontSize: '12px', fontWeight: 700,
                color: 'var(--color-primary)', fontFamily: 'var(--font-mono)',
              }}>
                {key}
              </span>
              <span style={{ fontSize: '10px', color: '#888', flex: 1, fontFamily: 'var(--font-body)' }}>
                {DIM_LABELS[instance.shapeType][key]}
              </span>
              <input
                type="number"
                min={5}
                value={editDims[key] ?? 80}
                onChange={(e) => handleDimChange(key, e.target.value)}
                style={{
                  width: '60px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  padding: '3px 5px',
                  textAlign: 'right',
                }}
              />
              <span style={{ fontSize: '11px', color: '#888' }}>cm</span>
            </div>
          ))}

          {/* Confirm + Save row */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); commitEdit(); }}
              style={{
                flex: 1,
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                padding: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              Uygula
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateCustomShapeInstance(instance.id, { dims: editDims });
                setIsEditing(false);
                setSaveCustomShapeId(instance.id);
              }}
              style={{
                flex: 1,
                background: 'var(--color-surface)',
                color: 'var(--color-primary)',
                border: '1px solid var(--color-primary)',
                borderRadius: '3px',
                padding: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
              }}
            >
              Kaydet
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}
  </>
  );
});
