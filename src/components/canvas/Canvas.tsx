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
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);
  const isDrawingMode = useUiStore((s) => s.isDrawingMode);
  const setDrawingMode = useUiStore((s) => s.setDrawingMode);

  const svgRef = useRef<SVGSVGElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 800, h: 600 });
  const [drawPoints, setDrawPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

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

  const {
    canvas,
    onPointerDownCanvas,
    onPointerMoveCanvas,
    onPointerUpCanvas,
    onWheel,
    onTouchStart,
    onTouchMove,
  } = useCanvas();

  const { zoom, panX, panY, viewRotation } = canvas;
  const cx = svgSize.w / 2;
  const cy = svgSize.h / 2;

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
        // Close polygon
        createRoomFromPoints(drawPoints);
        const sw = svgRef.current?.getBoundingClientRect().width ?? 800;
        const sh = svgRef.current?.getBoundingClientRect().height ?? 600;
        fitRoomToCanvas(sw, sh);
        setDrawingMode(false);
        setDrawPoints([]);
        return;
      }
    }

    setDrawPoints((prev) => [...prev, cm]);
  };

  const handleDrawMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawingMode) return;
    setCursorPos(svgToCm(e.clientX, e.clientY));
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDrawingMode) {
      handleDrawClick(e);
    } else {
      setSelectedItemId(null);
      onPointerDownCanvas(e);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDrawingMode) {
      handleDrawMove(e);
    } else {
      onPointerMoveCanvas(e);
    }
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
          cursor: isDrawingMode ? 'crosshair' : 'default',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={isDrawingMode ? undefined : onPointerUpCanvas}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        {/* Rotation around canvas center, then pan + zoom */}
        <g transform={`rotate(${viewRotation}, ${cx}, ${cy})`}>
          <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
            {room && (
              <Room room={room} viewRotation={viewRotation} zoom={zoom} canvasRef={svgRef} />
            )}

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
            Select a room template or draw your room to begin.
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
              ? `Click to place points (${drawPoints.length} placed)`
              : 'Click near first point to close room — or keep adding points'}
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
    </div>
  );
});
