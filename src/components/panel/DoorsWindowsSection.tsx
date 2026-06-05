import { memo } from 'react';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { distancePointToSegment, segmentLength, pxToCm } from '../../lib/geometry';
import { DEFAULT_DOOR_WIDTH_CM, DEFAULT_WINDOW_WIDTH_CM } from '../../lib/constants';
import type { Door, Window } from '../../types';

function findNearestWall(cmX: number, cmY: number, room: ReturnType<typeof usePlanStore.getState>['room']) {
  if (!room) return null;
  let best: { wallId: string; t: number; dist: number } | null = null;
  for (const wall of room.walls) {
    const a = room.points[wall.startPointIndex];
    const b = room.points[wall.endPointIndex];
    const dist = distancePointToSegment({ x: cmX, y: cmY }, a, b);
    if (!best || dist < best.dist) {
      const wallLen = segmentLength(a, b);
      if (wallLen === 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((cmX - a.x) * dx + (cmY - a.y) * dy) / (wallLen * wallLen)));
      best = { wallId: wall.id, t, dist };
    }
  }
  return best;
}

function startDoorDrag(e: React.PointerEvent, type: 'door' | 'window') {
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);

  // Create ghost div
  const ghost = document.createElement('div');
  ghost.style.cssText = `
    position: fixed; pointer-events: none; z-index: 9999;
    padding: 4px 8px; background: var(--color-surface);
    border: 1px dashed var(--color-primary); border-radius: 4px;
    font-family: var(--font-body); font-size: 12px;
    color: var(--color-text); white-space: nowrap;
    transform: translate(-50%, -50%);
  `;
  ghost.textContent = type === 'door' ? 'Door' : 'Window';
  ghost.style.left = `${e.clientX}px`;
  ghost.style.top = `${e.clientY}px`;
  document.body.appendChild(ghost);

  const onMove = (ev: PointerEvent) => {
    ghost.style.left = `${ev.clientX}px`;
    ghost.style.top = `${ev.clientY}px`;
  };

  const onUp = (ev: PointerEvent) => {
    ghost.remove();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);

    // Hit test canvas
    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (!canvasSvg) return;
    const r = canvasSvg.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;

    const state = usePlanStore.getState();
    const { canvas, room } = state;
    if (!room) return;

    const svgX = ev.clientX - r.left;
    const svgY = ev.clientY - r.top;
    const cmX = pxToCm((svgX - canvas.panX) / canvas.zoom);
    const cmY = pxToCm((svgY - canvas.panY) / canvas.zoom);

    const nearest = findNearestWall(cmX, cmY, room);
    if (!nearest || nearest.dist > 20) return; // 20 cm threshold

    if (type === 'door') {
      const door: Door = {
        id: crypto.randomUUID(),
        wallId: nearest.wallId,
        positionOnWall: nearest.t,
        widthCm: DEFAULT_DOOR_WIDTH_CM,
        opensTo: 'outside',
        hingeSide: 'left',
      };
      state.addDoor(door);
      useUiStore.getState().setSelectedItemId(door.id);
    } else {
      const win: Window = {
        id: crypto.randomUUID(),
        wallId: nearest.wallId,
        positionOnWall: nearest.t,
        widthCm: DEFAULT_WINDOW_WIDTH_CM,
      };
      state.addWindow(win);
      useUiStore.getState().setSelectedItemId(win.id);
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

export const DoorsWindowsSection = memo(function DoorsWindowsSection() {
  const room = usePlanStore((s) => s.room);
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const updateDoor = usePlanStore((s) => s.updateDoor);
  const removeDoor = usePlanStore((s) => s.removeDoor);
  const updateWindow = usePlanStore((s) => s.updateWindow);
  const removeWindow = usePlanStore((s) => s.removeWindow);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);

  // Find selected door or window
  const selectedDoor = room?.doors.find((d) => d.id === selectedItemId) ?? null;
  const selectedWindow = room?.windows.find((w) => w.id === selectedItemId) ?? null;

  if (!room) {
    return (
      <div className="px-3 py-3 text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>
        Create a room first.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Draggable items */}
      <div className="p-3 border-b border-border">
        <p className="text-xs text-text-muted mb-2" style={{ fontFamily: 'var(--font-body)' }}>
          Drag onto a wall to place
        </p>
        <div className="flex gap-2">
          {(['door', 'window'] as const).map((type) => (
            <div
              key={type}
              className="flex-1 flex flex-col items-center gap-1 p-2 rounded border border-border hover:border-primary cursor-grab select-none transition-colors duration-fast"
              style={{ background: 'var(--color-surface)', fontFamily: 'var(--font-body)' }}
              onPointerDown={(e) => startDoorDrag(e, type)}
            >
              <svg width="32" height="24" viewBox="0 0 32 24">
                {type === 'door' ? (
                  <>
                    <line x1="4" y1="12" x2="10" y2="12" stroke="var(--color-room-outline)" strokeWidth="2" />
                    <line x1="22" y1="12" x2="28" y2="12" stroke="var(--color-room-outline)" strokeWidth="2" />
                    <line x1="10" y1="12" x2="10" y2="0" stroke="var(--color-room-outline)" strokeWidth="1.5" />
                    <path d="M 10 0 A 12 12 0 0 1 22 12" fill="none" stroke="var(--color-secondary,#5E8FB5)" strokeWidth="1" strokeDasharray="3 2" />
                  </>
                ) : (
                  <>
                    <line x1="4" y1="12" x2="10" y2="12" stroke="var(--color-room-outline)" strokeWidth="2" />
                    <line x1="22" y1="12" x2="28" y2="12" stroke="var(--color-room-outline)" strokeWidth="2" />
                    <line x1="10" y1="12" x2="22" y2="12" stroke="var(--color-room-outline)" strokeWidth="1.5" />
                    <line x1="10" y1="9" x2="22" y2="9" stroke="var(--color-room-outline)" strokeWidth="1" />
                    <line x1="10" y1="15" x2="22" y2="15" stroke="var(--color-room-outline)" strokeWidth="1.5" />
                  </>
                )}
              </svg>
              <span className="text-xs text-[var(--color-text)] capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Door editing */}
      {selectedDoor && (
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--color-text)]" style={{ fontFamily: 'var(--font-body)' }}>
              Door
            </span>
            <button
              onClick={() => { removeDoor(selectedDoor.id); setSelectedItemId(null); }}
              className="text-xs text-text-muted hover:text-[var(--color-error,#c0392b)] cursor-pointer transition-colors duration-fast"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Delete
            </button>
          </div>

          {/* Width */}
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>Width</label>
            <input
              type="number"
              min={40} max={300}
              value={selectedDoor.widthCm}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) updateDoor(selectedDoor.id, { widthCm: v });
              }}
              className="w-20 px-2 py-1 text-sm rounded border border-border bg-[var(--color-background)] text-[var(--color-text)] outline-none focus:border-primary"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>cm</span>
          </div>

          {/* Hinge */}
          <div className="flex gap-1 mb-2">
            {(['left', 'right'] as const).map((side) => (
              <button
                key={side}
                onClick={() => updateDoor(selectedDoor.id, { hingeSide: side })}
                className="flex-1 text-xs py-1 rounded border cursor-pointer transition-colors duration-fast capitalize"
                style={{
                  fontFamily: 'var(--font-body)',
                  background: selectedDoor.hingeSide === side ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: selectedDoor.hingeSide === side ? '#fff' : 'var(--color-text)',
                  borderColor: selectedDoor.hingeSide === side ? 'var(--color-primary)' : 'var(--color-border)',
                }}
              >
                {side}
              </button>
            ))}
          </div>

          {/* Opens to */}
          <div className="flex gap-1">
            {(['inside', 'outside'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => updateDoor(selectedDoor.id, { opensTo: dir })}
                className="flex-1 text-xs py-1 rounded border cursor-pointer transition-colors duration-fast capitalize"
                style={{
                  fontFamily: 'var(--font-body)',
                  background: selectedDoor.opensTo === dir ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: selectedDoor.opensTo === dir ? '#fff' : 'var(--color-text)',
                  borderColor: selectedDoor.opensTo === dir ? 'var(--color-primary)' : 'var(--color-border)',
                }}
              >
                {dir}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Window editing */}
      {selectedWindow && (
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--color-text)]" style={{ fontFamily: 'var(--font-body)' }}>
              Window
            </span>
            <button
              onClick={() => { removeWindow(selectedWindow.id); setSelectedItemId(null); }}
              className="text-xs text-text-muted hover:text-[var(--color-error,#c0392b)] cursor-pointer transition-colors duration-fast"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Delete
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>Width</label>
            <input
              type="number"
              min={40} max={500}
              value={selectedWindow.widthCm}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) updateWindow(selectedWindow.id, { widthCm: v });
              }}
              className="w-20 px-2 py-1 text-sm rounded border border-border bg-[var(--color-background)] text-[var(--color-text)] outline-none focus:border-primary"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>cm</span>
          </div>
        </div>
      )}
    </div>
  );
});
