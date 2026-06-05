import { memo } from 'react';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { pxToCm } from '../../lib/geometry';
import { DEFAULT_DIMS, SHAPE_NAMES } from '../../lib/customShapes';
import type { CustomShapeInstance, CustomShapeType } from '../../types';

// ── SVG thumbnail paths for each shape ───────────────────────────────────
function ShapeThumbnail({ type }: { type: CustomShapeType }) {
  switch (type) {
    case 'rect':
      return (
        <svg width="40" height="30" viewBox="0 0 40 30">
          <rect x="2" y="4" width="36" height="22"
            fill="var(--color-furniture-fill)"
            stroke="var(--color-room-outline)" strokeWidth={1.5} />
        </svg>
      );
    case 'l-shape':
      return (
        <svg width="40" height="30" viewBox="0 0 40 30">
          <polygon
            points="2,2 28,2 28,14 22,14 22,28 2,28"
            fill="var(--color-furniture-fill)"
            stroke="var(--color-room-outline)" strokeWidth={1.5} />
        </svg>
      );
    case 'chamfered':
      return (
        <svg width="40" height="30" viewBox="0 0 40 30">
          <polygon
            points="2,2 28,2 38,10 38,28 2,28"
            fill="var(--color-furniture-fill)"
            stroke="var(--color-room-outline)" strokeWidth={1.5} />
        </svg>
      );
    default:
      return null;
  }
}

const SHAPE_TYPES: CustomShapeType[] = ['rect', 'l-shape', 'chamfered'];

function createShapeGhost(shapeType: CustomShapeType): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);opacity:0.85;';
  svg.setAttribute('width', '48');
  svg.setAttribute('height', '36');
  svg.setAttribute('viewBox', '0 0 48 36');
  const fill = 'var(--color-furniture-fill)';
  const stroke = 'var(--color-primary)';
  if (shapeType === 'rect') {
    svg.innerHTML = `<rect x="1" y="1" width="46" height="34" fill="${fill}" fill-opacity="0.82" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  } else if (shapeType === 'l-shape') {
    svg.innerHTML = `<polygon points="1,1 30,1 30,16 24,16 24,35 1,35" fill="${fill}" fill-opacity="0.82" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  } else {
    svg.innerHTML = `<polygon points="1,1 34,1 47,12 47,35 1,35" fill="${fill}" fill-opacity="0.82" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  }
  return svg;
}

function addShapeToCenter(shapeType: CustomShapeType) {
  const state = usePlanStore.getState();
  if (!state.room) return;
  const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
  const r = canvasSvg?.getBoundingClientRect();
  const svgW = r?.width ?? 800;
  const svgH = r?.height ?? 600;
  const { canvas } = state;
  const cmX = pxToCm((svgW / 2 - canvas.panX) / canvas.zoom);
  const cmY = pxToCm((svgH / 2 - canvas.panY) / canvas.zoom);
  const dims = { ...DEFAULT_DIMS[shapeType] };
  const instance: CustomShapeInstance = {
    id: crypto.randomUUID(),
    shapeType,
    position: { x: cmX - dims.A / 2, y: cmY - dims.B / 2 },
    rotation: 0,
    dims,
  };
  state.addCustomShapeInstance(instance);
  useUiStore.getState().setSelectedItemId(instance.id);
}

function startShapeDrag(e: React.PointerEvent, shapeType: CustomShapeType) {
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);

  const ghost = createShapeGhost(shapeType);
  ghost.style.left = `${e.clientX}px`;
  ghost.style.top  = `${e.clientY}px`;
  document.body.appendChild(ghost);

  const onMove = (ev: PointerEvent) => {
    ghost.style.left = `${ev.clientX}px`;
    ghost.style.top  = `${ev.clientY}px`;
  };

  const onUp = (ev: PointerEvent) => {
    ghost.remove();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);

    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (!canvasSvg) return;
    const r = canvasSvg.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;

    const state = usePlanStore.getState();
    const { canvas } = state;
    if (!state.room) return;

    const cmX = pxToCm((ev.clientX - r.left - canvas.panX) / canvas.zoom);
    const cmY = pxToCm((ev.clientY - r.top  - canvas.panY) / canvas.zoom);

    const dims = { ...DEFAULT_DIMS[shapeType] };
    const w = dims.A;
    const h = dims.B;

    const instance: CustomShapeInstance = {
      id: crypto.randomUUID(),
      shapeType,
      position: { x: cmX - w / 2, y: cmY - h / 2 },
      rotation: 0,
      dims,
    };

    state.addCustomShapeInstance(instance);
    useUiStore.getState().setSelectedItemId(instance.id);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

export const CustomShapesSection = memo(function CustomShapesSection() {
  const room = usePlanStore((s) => s.room);

  if (!room) {
    return (
      <div className="px-3 py-3 text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>
        Önce bir oda oluşturun.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="p-3">
        <p className="text-xs text-text-muted mb-2" style={{ fontFamily: 'var(--font-body)' }}>
          Sahneye sürükle, üzerine çift tıkla ölçülendir
        </p>
        <div className="flex gap-2">
          {SHAPE_TYPES.map((type) => (
            <div
              key={type}
              className="flex-1 flex flex-col items-center gap-1 p-2 rounded border border-border hover:border-primary cursor-grab select-none transition-colors duration-fast"
              style={{ background: 'var(--color-surface)', fontFamily: 'var(--font-body)' }}
              onPointerDown={(e) => startShapeDrag(e, type)}
              onDoubleClick={() => addShapeToCenter(type)}
            >
              <ShapeThumbnail type={type} />
              <span className="text-xs text-[var(--color-text)]">{SHAPE_NAMES[type]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
