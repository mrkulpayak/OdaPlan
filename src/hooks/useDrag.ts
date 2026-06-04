import { useRef, useCallback } from 'react';
import { usePlanStore } from '../store/planStore';
import { useUiStore } from '../store/uiStore';
import { useCatalogStore } from '../store/catalogStore';
import { computeSnap } from './useSnap';
import { pxToCm, cmToPx } from '../lib/geometry';
import type { FurnitureCatalogItem, FurnitureInstance } from '../types';

// Ghost element rendered as a floating SVG overlay during drag
let ghostEl: SVGSVGElement | null = null;
function getOrCreateGhost(): SVGSVGElement {
  if (!ghostEl) {
    ghostEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ghostEl.style.position = 'fixed';
    ghostEl.style.pointerEvents = 'none';
    ghostEl.style.zIndex = '9999';
    ghostEl.style.opacity = '0.7';
    document.body.appendChild(ghostEl);
  }
  return ghostEl;
}

function removeGhost() {
  if (ghostEl) {
    ghostEl.remove();
    ghostEl = null;
  }
}

function updateGhost(x: number, y: number, item: FurnitureCatalogItem, zoom: number) {
  const svg = getOrCreateGhost();
  const w = cmToPx(item.widthCm) * zoom;
  const h = cmToPx(item.depthCm) * zoom;
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.style.left = `${x - w / 2}px`;
  svg.style.top = `${y - h / 2}px`;

  svg.innerHTML = `
    <rect x="0" y="0" width="${w}" height="${h}"
      fill="var(--color-furniture-fill)"
      stroke="var(--color-primary)"
      stroke-width="1.5"
      stroke-dasharray="4 3"
      rx="1"
    />
    <line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="var(--color-furniture-border)" stroke-width="2.5" stroke-opacity="0.7"/>
  `;
}

function updateSnapGuides(
  guideLines: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  panX: number,
  panY: number,
  zoom: number
) {
  const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
  if (!canvasSvg) return;

  let guide = canvasSvg.querySelector('#snap-guides');
  if (!guide) {
    guide = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    guide.setAttribute('id', 'snap-guides');
    canvasSvg.appendChild(guide);
  }

  if (guideLines.length === 0) {
    guide.innerHTML = '';
    return;
  }

  guide.innerHTML = guideLines
    .map(({ x1, y1, x2, y2 }) => {
      const px1 = cmToPx(x1) * zoom + panX;
      const py1 = cmToPx(y1) * zoom + panY;
      const px2 = cmToPx(x2) * zoom + panX;
      const py2 = cmToPx(y2) * zoom + panY;
      return `<line x1="${px1}" y1="${py1}" x2="${px2}" y2="${py2}" stroke="var(--color-accent)" stroke-width="1" stroke-dasharray="6 4" />`;
    })
    .join('');
}

function clearSnapGuides() {
  const guide = document.querySelector('#canvas svg #snap-guides');
  if (guide) guide.innerHTML = '';
}

export function useDrag() {
  const addFurnitureInstance = usePlanStore((s) => s.addFurnitureInstance);
  const updateFurnitureInstance = usePlanStore((s) => s.updateFurnitureInstance);
  const planStore = usePlanStore;
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);

  const dragState = useRef<{
    item: FurnitureCatalogItem;
    instanceId?: string; // set when moving existing furniture
    mode: 'catalog' | 'move';
  } | null>(null);

  const startDrag = useCallback((e: React.PointerEvent, item: FurnitureCatalogItem) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { item, mode: 'catalog' };
    const state = planStore.getState();
    updateGhost(e.clientX, e.clientY, item, state.canvas.zoom);
  }, [planStore]);

  const startMoveDrag = useCallback((e: React.PointerEvent, instance: FurnitureInstance, item: FurnitureCatalogItem) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { item, instanceId: instance.id, mode: 'move' };
    const state = planStore.getState();
    updateGhost(e.clientX, e.clientY, item, state.canvas.zoom);
  }, [planStore]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragState.current) return;
    const state = planStore.getState();
    const { canvas, room, furnitureInstances } = state;

    updateGhost(e.clientX, e.clientY, dragState.current.item, canvas.zoom);

    // Compute canvas position in cm
    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (!canvasSvg) return;
    const r = canvasSvg.getBoundingClientRect();
    const svgX = e.clientX - r.left;
    const svgY = e.clientY - r.top;
    const cmX = pxToCm((svgX - canvas.panX) / canvas.zoom);
    const cmY = pxToCm((svgY - canvas.panY) / canvas.zoom);

    const item = dragState.current.item;
    const pos = { x: cmX - item.widthCm / 2, y: cmY - item.depthCm / 2 };

    const otherInstances = dragState.current.instanceId
      ? furnitureInstances.filter((fi) => fi.id !== dragState.current!.instanceId)
      : furnitureInstances;

    const { products } = useCatalogStore.getState();
    const itemMap = new Map(products.map((p) => [p.id, p]));

    const snap = computeSnap(pos, item, room, otherInstances, itemMap);
    updateSnapGuides(snap.guideLines, canvas.panX, canvas.panY, canvas.zoom);
  }, [planStore]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    if (!dragState.current) return;

    const state = planStore.getState();
    const { canvas, room, furnitureInstances } = state;

    // Check if pointer is over canvas
    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    removeGhost();
    clearSnapGuides();

    if (canvasSvg && room) {
      const r = canvasSvg.getBoundingClientRect();
      const svgX = e.clientX - r.left;
      const svgY = e.clientY - r.top;

      // Check bounds
      if (svgX >= 0 && svgX <= r.width && svgY >= 0 && svgY <= r.height) {
        const cmX = pxToCm((svgX - canvas.panX) / canvas.zoom);
        const cmY = pxToCm((svgY - canvas.panY) / canvas.zoom);

        const item = dragState.current.item;
        const pos = { x: cmX - item.widthCm / 2, y: cmY - item.depthCm / 2 };

        const otherInstances = dragState.current.instanceId
          ? furnitureInstances.filter((fi) => fi.id !== dragState.current!.instanceId)
          : furnitureInstances;

        const { products } = useCatalogStore.getState();
        const itemMap = new Map(products.map((p) => [p.id, p]));

        const snap = computeSnap(pos, item, room, otherInstances, itemMap);

        if (dragState.current.mode === 'catalog') {
          const id = crypto.randomUUID();
          addFurnitureInstance({
            id,
            catalogItemId: item.id,
            position: snap.position,
            rotation: snap.rotation,
            snappedTo: snap.snappedTo,
          });
          setSelectedItemId(id);
        } else if (dragState.current.instanceId) {
          updateFurnitureInstance(dragState.current.instanceId, {
            position: snap.position,
            rotation: snap.rotation,
            snappedTo: snap.snappedTo,
          });
        }
      }
    }

    dragState.current = null;
  }, [planStore, addFurnitureInstance, updateFurnitureInstance, setSelectedItemId]);

  // Attach global pointer move/up listeners once
  const attached = useRef(false);
  if (!attached.current) {
    attached.current = true;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  return { startDrag, startMoveDrag };
}
