import { useCallback, useRef } from 'react';
import { usePlanStore } from '../store/planStore';

export function useCanvas() {
  const canvas = usePlanStore((s) => s.canvas);
  const setCanvasState = usePlanStore((s) => s.setCanvasState);

  const isPanning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const pinchDistance = useRef<number | null>(null);

  const clampZoom = (z: number) => Math.min(4, Math.max(0.25, z));

  const onPointerDownCanvas = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    if (target.closest('[data-interactive]')) return;
    isPanning.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMoveCanvas = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setCanvasState({ panX: canvas.panX + dx, panY: canvas.panY + dy });
  }, [canvas.panX, canvas.panY, setCanvasState]);

  const onPointerUpCanvas = useCallback(() => {
    isPanning.current = false;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = clampZoom(canvas.zoom + delta);
    const scale = newZoom / canvas.zoom;

    setCanvasState({
      zoom: newZoom,
      panX: mouseX - scale * (mouseX - canvas.panX),
      panY: mouseY - scale * (mouseY - canvas.panY),
    });
  }, [canvas, setCanvasState]);

  const onTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDistance.current = Math.hypot(dx, dy);
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2 && pinchDistance.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const scale = newDist / pinchDistance.current;
      pinchDistance.current = newDist;
      setCanvasState({ zoom: clampZoom(canvas.zoom * scale) });
    }
  }, [canvas.zoom, setCanvasState]);

  const rotateView = useCallback((direction: 'cw' | 'ccw') => {
    const current = canvas.viewRotation;
    const next = direction === 'cw'
      ? ((current + 90) % 360) as 0 | 90 | 180 | 270
      : ((current + 270) % 360) as 0 | 90 | 180 | 270;
    setCanvasState({ viewRotation: next });
  }, [canvas.viewRotation, setCanvasState]);

  return {
    canvas,
    onPointerDownCanvas,
    onPointerMoveCanvas,
    onPointerUpCanvas,
    onWheel,
    onTouchStart,
    onTouchMove,
    rotateView,
  };
}
