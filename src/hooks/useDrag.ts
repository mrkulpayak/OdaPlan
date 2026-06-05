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
    // CSS rotation will be applied per-update
    ghostEl.style.transformOrigin = 'center';
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

function renderGhostContent(svg: SVGSVGElement, item: FurnitureCatalogItem, w: number, h: number) {
  const fill = 'var(--color-furniture-fill)';
  const stroke = 'var(--color-primary)';
  const sw = '1.5';
  const da = '4 3';
  const op = '0.82';

  let shape = '';
  if (item.shapeType === 'circle') {
    const r = Math.min(w, h) / 2;
    shape = `<circle cx="${w/2}" cy="${h/2}" r="${r}" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${da}"/>`;
  } else if (item.shapeType === 'semicircle') {
    shape = `<path d="M 0 ${h} A ${w/2} ${h} 0 0 1 ${w} ${h} Z" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${da}"/>`;
  } else if (item.shapeType === 'quarterCircle') {
    shape = `<path d="M 0 0 L ${w} 0 A ${w} ${h} 0 0 0 0 ${h} Z" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${da}"/>`;
  } else if (item.shapeType === 'chamferedRectangle') {
    const rawC = (item.params?.chamferCm as number) ?? 20;
    const scale = w / (item.widthCm * 4);
    const c = Math.min(rawC * scale * 4, w * 0.4, h * 0.4);
    shape = `<path d="M ${c} 0 L ${w-c} 0 L ${w} ${c} L ${w} ${h-c} L ${w-c} ${h} L ${c} ${h} L 0 ${h-c} L 0 ${c} Z" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${da}"/>`;
  } else if (item.shapeType === 'cornerCabinet') {
    shape = `<path d="M 0 0 L ${w} 0 L 0 ${h} Z" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${da}"/>`;
  } else {
    // rectangle, square, default
    shape = `<rect x="0" y="0" width="${w}" height="${h}" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${da}" rx="1"/>`;
  }
  const frontLine = `<line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="var(--color-furniture-border)" stroke-width="2.5" stroke-opacity="0.7"/>`;
  svg.innerHTML = shape + frontLine;
}

/**
 * Update ghost SVG position and rotation.
 * @param centerScreenX - Screen X of the furniture's VISUAL CENTER
 * @param centerScreenY - Screen Y of the furniture's VISUAL CENTER
 * @param item - Catalog item (for dimensions)
 * @param zoom - Current canvas zoom
 * @param rotation - Rotation in degrees (applied via CSS)
 */
function updateGhost(
  centerScreenX: number,
  centerScreenY: number,
  item: FurnitureCatalogItem,
  zoom: number,
  rotation: number
) {
  const svg = getOrCreateGhost();
  const w = cmToPx(item.widthCm) * zoom;
  const h = cmToPx(item.depthCm) * zoom;
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  // Position top-left so the center lands at (centerScreenX, centerScreenY)
  svg.style.left = `${centerScreenX - w / 2}px`;
  svg.style.top  = `${centerScreenY - h / 2}px`;
  // Apply rotation via CSS around the element's center (transform-origin: center)
  svg.style.transform = rotation ? `rotate(${rotation}deg)` : 'none';
  renderGhostContent(svg, item, w, h);
}

/** Convert furniture position (top-left cm) + dimensions → screen center coords */
function cmPosToScreenCenter(
  posX: number,
  posY: number,
  w: number,
  d: number,
  canvasRect: DOMRect,
  panX: number,
  panY: number,
  zoom: number
) {
  return {
    x: canvasRect.left + cmToPx(posX + w / 2) * zoom + panX,
    y: canvasRect.top  + cmToPx(posY + d / 2) * zoom + panY,
  };
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

function getCanvasSvgAndRect() {
  const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
  return canvasSvg ? { canvasSvg, r: canvasSvg.getBoundingClientRect() } : null;
}

export function useDrag() {
  const addFurnitureInstance = usePlanStore((s) => s.addFurnitureInstance);
  const updateFurnitureInstance = usePlanStore((s) => s.updateFurnitureInstance);
  const planStore = usePlanStore;
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);

  const dragState = useRef<{
    item: FurnitureCatalogItem;
    instanceId?: string;
    mode: 'catalog' | 'move';
    dragOffset: { x: number; y: number };
    rotation: number; // current rotation of the dragged furniture (preserved throughout drag)
  } | null>(null);

  const startDrag = useCallback((e: React.PointerEvent, item: FurnitureCatalogItem) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      item,
      mode: 'catalog',
      dragOffset: { x: item.widthCm / 2, y: item.depthCm / 2 },
      rotation: 0,
    };
    const { canvas } = planStore.getState();
    const cvInfo = getCanvasSvgAndRect();
    if (cvInfo) {
      // Show ghost centered at cursor
      updateGhost(e.clientX, e.clientY, item, canvas.zoom, 0);
    }
  }, [planStore]);

  const startMoveDrag = useCallback((e: React.PointerEvent, instance: FurnitureInstance, item: FurnitureCatalogItem) => {
    e.currentTarget.setPointerCapture(e.pointerId);

    const cvInfo = getCanvasSvgAndRect();
    const { canvas } = planStore.getState();

    // Compute dragOffset: where the pointer is within the furniture (in cm)
    let dragOffset = { x: item.widthCm / 2, y: item.depthCm / 2 };
    if (cvInfo) {
      const cmX = pxToCm((e.clientX - cvInfo.r.left - canvas.panX) / canvas.zoom);
      const cmY = pxToCm((e.clientY - cvInfo.r.top - canvas.panY) / canvas.zoom);
      dragOffset = { x: cmX - instance.position.x, y: cmY - instance.position.y };
    }

    dragState.current = {
      item,
      instanceId: instance.id,
      mode: 'move',
      dragOffset,
      rotation: instance.rotation, // preserve existing rotation
    };

    // Show ghost at the furniture's CURRENT visual center
    if (cvInfo) {
      const screen = cmPosToScreenCenter(
        instance.position.x, instance.position.y,
        item.widthCm, item.depthCm,
        cvInfo.r, canvas.panX, canvas.panY, canvas.zoom
      );
      updateGhost(screen.x, screen.y, item, canvas.zoom, instance.rotation);
    }
  }, [planStore]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragState.current) return;
    const state = planStore.getState();
    const { canvas, room, furnitureInstances } = state;

    const cvInfo = getCanvasSvgAndRect();
    if (!cvInfo) return;
    const { r } = cvInfo;

    const cmX = pxToCm((e.clientX - r.left - canvas.panX) / canvas.zoom);
    const cmY = pxToCm((e.clientY - r.top - canvas.panY) / canvas.zoom);

    const item = dragState.current.item;
    const { dragOffset, rotation } = dragState.current;
    const pos = { x: cmX - dragOffset.x, y: cmY - dragOffset.y };

    const otherInstances = dragState.current.instanceId
      ? furnitureInstances.filter((fi) => fi.id !== dragState.current!.instanceId)
      : furnitureInstances;

    const { products } = useCatalogStore.getState();
    const itemMap = new Map(products.map((p) => [p.id, p]));

    // Pass the current rotation so snap preserves it and measures distances from rotated edges
    const snap = computeSnap(pos, item, room, otherInstances, itemMap, rotation);
    updateSnapGuides(snap.guideLines, canvas.panX, canvas.panY, canvas.zoom);

    // Show ghost at the SNAPPED position (visual center), with the rotation applied
    const screenCenter = cmPosToScreenCenter(
      snap.position.x, snap.position.y,
      item.widthCm, item.depthCm,
      r, canvas.panX, canvas.panY, canvas.zoom
    );
    updateGhost(screenCenter.x, screenCenter.y, item, canvas.zoom, snap.rotation);
  }, [planStore]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    if (!dragState.current) return;

    const state = planStore.getState();
    const { canvas, room, furnitureInstances } = state;

    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    removeGhost();
    clearSnapGuides();

    if (canvasSvg && room) {
      const r = canvasSvg.getBoundingClientRect();
      const svgX = e.clientX - r.left;
      const svgY = e.clientY - r.top;

      if (svgX >= 0 && svgX <= r.width && svgY >= 0 && svgY <= r.height) {
        const cmX = pxToCm((svgX - canvas.panX) / canvas.zoom);
        const cmY = pxToCm((svgY - canvas.panY) / canvas.zoom);

        const item = dragState.current.item;
        const { dragOffset, rotation } = dragState.current;
        const pos = { x: cmX - dragOffset.x, y: cmY - dragOffset.y };

        const otherInstances = dragState.current.instanceId
          ? furnitureInstances.filter((fi) => fi.id !== dragState.current!.instanceId)
          : furnitureInstances;

        const { products } = useCatalogStore.getState();
        const itemMap = new Map(products.map((p) => [p.id, p]));

        const snap = computeSnap(pos, item, room, otherInstances, itemMap, rotation);

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
