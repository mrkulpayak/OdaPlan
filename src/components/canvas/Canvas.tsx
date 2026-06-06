import { memo, useRef, useState, useEffect } from 'react';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { useCanvas } from '../../hooks/useCanvas';
import { pxToCm, cmToPx } from '../../lib/geometry';
import { Room } from './Room';

export const Canvas = memo(function Canvas() {
  const room = usePlanStore((s) => s.room);
  const createRoomFromPoints = usePlanStore((s) => s.createRoomFromPoints);
  const fitRoomToCanvas = usePlanStore((s) => s.fitRoomToCanvas);
  const removeDoor = usePlanStore((s) => s.removeDoor);
  const removeWindow = usePlanStore((s) => s.removeWindow);
  const removeColumn = usePlanStore((s) => s.removeColumn);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const isDrawingMode = useUiStore((s) => s.isDrawingMode);
  const setDrawingMode = useUiStore((s) => s.setDrawingMode);
  const isMeasureMode = useUiStore((s) => s.isMeasureMode);
  const measureLine = useUiStore((s) => s.measureLine);
  const setMeasureLine = useUiStore((s) => s.setMeasureLine);
  const measureDragRef = useRef<{ start: { x: number; y: number } } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 800, h: 600 });
  const [drawPoints, setDrawPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingPoints, setPendingPoints] = useState<Array<{ x: number; y: number }> | null>(null);

  useEffect(() => {
    const update = () => {
      if (svgRef.current) {
        const r = svgRef.current.getBoundingClientRect();
        setSvgSize({ w: r.width, h: r.height });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Reset draw points when drawing mode is exited
  useEffect(() => {
    if (!isDrawingMode) setDrawPoints([]);
  }, [isDrawingMode]);

  // Delete selected door / window / column with Backspace or Delete
  useEffect(() => {
    if (!selectedItemId || !room) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (room.doors.some((d) => d.id === selectedItemId)) {
        removeDoor(selectedItemId);
        setSelectedItemId(null);
      } else if (room.windows.some((w) => w.id === selectedItemId)) {
        removeWindow(selectedItemId);
        setSelectedItemId(null);
      } else if ((room.columns ?? []).some((c) => c.id === selectedItemId)) {
        removeColumn(selectedItemId);
        setSelectedItemId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedItemId, room, removeDoor, removeWindow, removeColumn, setSelectedItemId]);

  const {
    canvas,
    onPointerDownCanvas,
    onPointerMoveCanvas,
    onPointerUpCanvas,
    onWheel,
    onTouchStart,
    onTouchMove,
  } = useCanvas();

  // Attach wheel listener as non-passive so preventDefault() works
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => onWheel(e as unknown as React.WheelEvent<SVGSVGElement>);
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, [onWheel]);

  // ── Orthogonalize: snap each point's incoming edge to H or V ─────────────
  const orthogonalizePoints = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length < 2) return pts;
    const result = [{ ...pts[0] }];
    for (let i = 1; i < pts.length; i++) {
      const prev = result[i - 1];
      const curr = pts[i];
      const dx = Math.abs(curr.x - prev.x);
      const dy = Math.abs(curr.y - prev.y);
      result.push(dx >= dy ? { x: curr.x, y: prev.y } : { x: prev.x, y: curr.y });
    }
    return result;
  };

  // ── Scale so longest edge = 500 cm ────────────────────────────────────────
  const scaleToMaxEdge = (pts: Array<{ x: number; y: number }>, maxCm = 500) => {
    let maxLen = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      maxLen = Math.max(maxLen, Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y));
    }
    if (maxLen < 1) return pts;
    const scale = maxCm / maxLen;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return pts.map(p => ({ x: cx + (p.x - cx) * scale, y: cy + (p.y - cy) * scale }));
  };

  const confirmRoom = (pts: Array<{ x: number; y: number }>) => {
    const scaled = scaleToMaxEdge(pts);
    createRoomFromPoints(scaled);
    const sw = svgRef.current?.getBoundingClientRect().width ?? 800;
    const sh = svgRef.current?.getBoundingClientRect().height ?? 600;
    fitRoomToCanvas(sw, sh);
    setPendingPoints(null);
  };

  const { zoom, panX, panY, viewRotation } = canvas;
  const cx = svgSize.w / 2;
  const cy = svgSize.h / 2;

  // Snap a point to H/V if within DRAW_SNAP_DEG degrees of those axes
  const DRAW_SNAP_DEG = 5;
  const snapDrawPoint = (raw: { x: number; y: number }, prev: { x: number; y: number } | null) => {
    if (!prev) return raw;
    const dx = raw.x - prev.x;
    const dy = raw.y - prev.y;
    if (Math.hypot(dx, dy) < 0.1) return raw;
    const angleDeg = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
    // Near horizontal: angle close to 0° or 180°
    if (angleDeg <= DRAW_SNAP_DEG || angleDeg >= 180 - DRAW_SNAP_DEG)
      return { x: raw.x, y: prev.y };
    // Near vertical: angle close to 90°
    if (Math.abs(angleDeg - 90) <= DRAW_SNAP_DEG)
      return { x: prev.x, y: raw.y };
    return raw;
  };

  // Convert SVG client pos → cm coordinates
  const svgToCm = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const svgX = clientX - r.left;
    const svgY = clientY - r.top;
    return {
      x: pxToCm((svgX - panX) / zoom),
      y: pxToCm((svgY - panY) / zoom),
    };
  };

  const handleDrawClick = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawingMode) return;
    e.stopPropagation();

    const cm = svgToCm(e.clientX, e.clientY);

    // Check if clicking near first point to close
    if (drawPoints.length >= 3) {
      const first = drawPoints[0];
      const firstPx = { x: cmToPx(first.x) * zoom + panX, y: cmToPx(first.y) * zoom + panY };
      const r = svgRef.current!.getBoundingClientRect();
      const clientFirstX = firstPx.x + r.left;
      const clientFirstY = firstPx.y + r.top;
      const dist = Math.hypot(e.clientX - clientFirstX, e.clientY - clientFirstY);
      if (dist < 12) {
        // Close polygon — show orthogonalize dialog
        setPendingPoints([...drawPoints]);
        setDrawingMode(false);
        setDrawPoints([]);
        return;
      }
    }

    const lastPt = drawPoints.length > 0 ? drawPoints[drawPoints.length - 1] : null;
    setDrawPoints((prev) => [...prev, snapDrawPoint(cm, lastPt)]);
  };

  const handleDrawMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawingMode) return;
    const raw = svgToCm(e.clientX, e.clientY);
    const lastPt = drawPoints.length > 0 ? drawPoints[drawPoints.length - 1] : null;
    setCursorPos(snapDrawPoint(raw, lastPt));
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isMeasureMode) {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const cm = svgToCm(e.clientX, e.clientY);
      measureDragRef.current = { start: cm };
      setMeasureLine({ start: cm, end: cm });
      return;
    }
    if (isDrawingMode) {
      handleDrawClick(e);
    } else {
      setSelectedItemId(null);
      onPointerDownCanvas(e);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isMeasureMode) {
      if (measureDragRef.current) {
        setMeasureLine({ start: measureDragRef.current.start, end: svgToCm(e.clientX, e.clientY) });
      }
      return;
    }
    if (isDrawingMode) {
      handleDrawMove(e);
    } else {
      onPointerMoveCanvas(e);
    }
  };

  const handlePointerUp = (_e: React.PointerEvent<SVGSVGElement>) => {
    if (isMeasureMode) {
      measureDragRef.current = null;
      return;
    }
    onPointerUpCanvas();
  };

  return (
    <div id="canvas" className="flex-1 overflow-hidden" style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          background: 'var(--color-background)',
          display: 'block',
          touchAction: 'none',
          cursor: (isDrawingMode || isMeasureMode) ? 'crosshair' : 'default',
          // Inject per-plan color overrides as CSS custom properties
          '--color-furniture-fill': canvas.furnitureColor,
          '--color-floor': canvas.floorColor,
        } as React.CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        {/* Grid pattern — defined at SVG root in screen-pixel space.
            patternUnits="userSpaceOnUse" means x/y/width/height are screen pixels.
            The offset (panX % tileSize) keeps the grid locked to world-space as the user pans.
            The rect that fills the grid is also at root level (outside any transform) so both
            the pattern and the rect live in the same coordinate system — no speed mismatch. */}
        {canvas.showGrid && (() => {
          const tile = 200 * zoom; // 50cm in screen pixels
          const ox = ((panX % tile) + tile) % tile; // always positive modulo
          const oy = ((panY % tile) + tile) % tile;
          return (
            <>
              <defs>
                <pattern id="grid-50cm" x={ox} y={oy}
                  width={tile} height={tile}
                  patternUnits="userSpaceOnUse">
                  <path
                    d={`M ${tile} 0 L 0 0 0 ${tile}`}
                    fill="none"
                    stroke="rgba(0,0,0,0.16)"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              {/* Rect at SVG root level — same coordinate system as the pattern */}
              <rect
                x={0} y={0}
                width={svgSize.w} height={svgSize.h}
                fill="url(#grid-50cm)"
                style={{ pointerEvents: 'none' }}
              />
            </>
          );
        })()}

        {/* Rotation around canvas center, then pan + zoom */}
        <g transform={`rotate(${viewRotation}, ${cx}, ${cy})`}>
          <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>

            {room && (
              <Room room={room} viewRotation={viewRotation} zoom={zoom} canvasRef={svgRef} />
            )}

            {/* Measure line overlay */}
            {isMeasureMode && measureLine && (() => {
              const x1 = cmToPx(measureLine.start.x);
              const y1 = cmToPx(measureLine.start.y);
              const x2 = cmToPx(measureLine.end.x);
              const y2 = cmToPx(measureLine.end.y);
              const distCm = Math.hypot(measureLine.end.x - measureLine.start.x, measureLine.end.y - measureLine.start.y);
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              const angleDeg = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
              // Keep text upright
              const textAngle = (angleDeg > 90 || angleDeg < -90) ? angleDeg + 180 : angleDeg;
              const arrowSize = 6 / zoom; // arrowhead size in SVG units (compensate zoom)
              const fontSize = 11 / zoom;
              const markerId = 'measure-arrow';
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <defs>
                    <marker id={markerId} markerWidth={arrowSize * 2} markerHeight={arrowSize * 2}
                      refX={arrowSize} refY={arrowSize} orient="auto" markerUnits="userSpaceOnUse">
                      <path
                        d={`M ${arrowSize * 2} ${arrowSize} L 0 ${arrowSize * 0.35} L 0 ${arrowSize * 1.65} Z`}
                        fill="var(--color-primary)"
                      />
                    </marker>
                    <marker id={`${markerId}-start`} markerWidth={arrowSize * 2} markerHeight={arrowSize * 2}
                      refX={arrowSize} refY={arrowSize} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                      <path
                        d={`M ${arrowSize * 2} ${arrowSize} L 0 ${arrowSize * 0.35} L 0 ${arrowSize * 1.65} Z`}
                        fill="var(--color-primary)"
                      />
                    </marker>
                  </defs>
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="var(--color-primary)" strokeWidth={1.5 / zoom}
                    markerEnd={`url(#${markerId})`}
                    markerStart={`url(#${markerId}-start)`}
                  />
                  {distCm > 1 && (
                    <text
                      x={mx} y={my}
                      textAnchor="middle" dominantBaseline="auto"
                      transform={`rotate(${textAngle}, ${mx}, ${my})`}
                      dy={-4 / zoom}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: `${fontSize}px`,
                        fill: 'var(--color-primary)',
                        userSelect: 'none',
                      }}
                    >
                      {Math.round(distCm)} cm
                    </text>
                  )}
                  {/* Endpoint dots */}
                  <circle cx={x1} cy={y1} r={3 / zoom} fill="var(--color-primary)" />
                  <circle cx={x2} cy={y2} r={3 / zoom} fill="var(--color-primary)" />
                </g>
              );
            })()}

            {/* Free-draw preview */}
            {isDrawingMode && drawPoints.length > 0 && (
              <g>
                {/* Placed points */}
                {drawPoints.map((p, i) => (
                  <circle
                    key={i}
                    cx={cmToPx(p.x)} cy={cmToPx(p.y)}
                    r={i === 0 ? 6 : 4}
                    fill={i === 0 ? 'var(--color-primary)' : 'var(--color-accent)'}
                    stroke="#fff"
                    strokeWidth={1}
                    style={{ pointerEvents: 'none' }}
                  />
                ))}

                {/* Placed wall lines */}
                {drawPoints.slice(1).map((p, i) => (
                  <line
                    key={i}
                    x1={cmToPx(drawPoints[i].x)} y1={cmToPx(drawPoints[i].y)}
                    x2={cmToPx(p.x)} y2={cmToPx(p.y)}
                    stroke="var(--color-room-outline)"
                    strokeWidth={1.5}
                    style={{ pointerEvents: 'none' }}
                  />
                ))}

                {/* Preview line to cursor */}
                {cursorPos && (
                  <line
                    x1={cmToPx(drawPoints[drawPoints.length - 1].x)}
                    y1={cmToPx(drawPoints[drawPoints.length - 1].y)}
                    x2={cmToPx(cursorPos.x)}
                    y2={cmToPx(cursorPos.y)}
                    stroke="var(--color-primary)"
                    strokeWidth={1}
                    strokeDasharray="6 4"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
              </g>
            )}
          </g>
        </g>

        {/* Empty state */}
        {!room && !isDrawingMode && (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              fill: 'var(--color-text-muted)',
              pointerEvents: 'none',
            }}
          >
            Başlamak için bir oda şablonu seçin veya özel oda çizin.
          </text>
        )}

        {isDrawingMode && (
          <text
            x="50%"
            y={svgSize.h - 20}
            textAnchor="middle"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              fill: 'var(--color-primary)',
              pointerEvents: 'none',
            }}
          >
            {drawPoints.length < 3
              ? `Nokta yerleştirmek için tıklayın (${drawPoints.length} nokta eklendi)`
              : 'Odayı kapatmak için ilk noktaya tıklayın — veya nokta eklemeye devam edin'}
          </text>
        )}

        {/* Zoom indicator */}
        <text
          x="100%"
          y="100%"
          dx={-12}
          dy={-10}
          textAnchor="end"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fill: 'var(--color-text-muted)',
            pointerEvents: 'none',
          }}
        >
          {Math.round(zoom * 100)}%
        </text>
      </svg>

      {/* Orthogonalize dialog — shown after polygon is closed */}
      {pendingPoints && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.25)',
          zIndex: 100,
        }}>
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minWidth: '260px',
            boxShadow: 'var(--shadow-modal)',
            fontFamily: 'var(--font-body)',
          }}>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text)', lineHeight: 1.4 }}>
              Tüm kenarlar dikey ve yatay olarak hizalansın mı?
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => confirmRoom(orthogonalizePoints(pendingPoints))}
                style={{
                  flex: 1, padding: '8px 0',
                  background: 'var(--color-primary)', color: '#fff',
                  border: 'none', borderRadius: '4px',
                  fontSize: '12px', cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Evet, hizala
              </button>
              <button
                onClick={() => confirmRoom(pendingPoints)}
                style={{
                  flex: 1, padding: '8px 0',
                  background: 'var(--color-surface-alt)', color: 'var(--color-text)',
                  border: '1px solid var(--color-border)', borderRadius: '4px',
                  fontSize: '12px', cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Olduğu gibi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
