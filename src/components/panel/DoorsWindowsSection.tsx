import { memo } from 'react';
import { usePlanStore } from '../../store/planStore';
import { useUiStore } from '../../store/uiStore';
import { distancePointToSegment, segmentLength, pxToCm } from '../../lib/geometry';
import { DEFAULT_DOOR_WIDTH_CM, DEFAULT_WINDOW_WIDTH_CM } from '../../lib/constants';
import type { Door, Window, Column } from '../../types';
import { adjustColPosForCorner } from '../canvas/ColumnItem';
import { LiveDimInput } from '../ui/LiveDimInput';

// Recompute top-left position so all flush wall faces stay anchored after a
// dimension change — the non-flush sides absorb the growth/shrink.
function adjustColPos(col: Column, newWc: number, newDc: number) {
  const room = usePlanStore.getState().room;
  if (!room) return col.position;
  return adjustColPosForCorner(col, newWc, newDc, room);
}

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

function createDoorWindowGhost(type: 'door' | 'window'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);opacity:0.9;';
  svg.setAttribute('width', '64');
  svg.setAttribute('height', '48');
  svg.setAttribute('viewBox', '0 0 64 48');
  if (type === 'door') {
    svg.innerHTML = `
      <line x1="0" y1="24" x2="10" y2="24" stroke="var(--color-room-outline)" stroke-width="3"/>
      <line x1="44" y1="24" x2="64" y2="24" stroke="var(--color-room-outline)" stroke-width="3"/>
      <line x1="10" y1="24" x2="10" y2="0" stroke="var(--color-room-outline)" stroke-width="2"/>
      <path d="M 10 0 A 34 34 0 0 1 44 24" fill="none" stroke="var(--color-secondary,#5E8FB5)" stroke-width="1.5" stroke-dasharray="4 3"/>
    `;
  } else {
    svg.innerHTML = `
      <line x1="0" y1="24" x2="10" y2="24" stroke="var(--color-room-outline)" stroke-width="3"/>
      <line x1="54" y1="24" x2="64" y2="24" stroke="var(--color-room-outline)" stroke-width="3"/>
      <line x1="10" y1="24" x2="54" y2="24" stroke="var(--color-room-outline)" stroke-width="2"/>
      <line x1="10" y1="19" x2="54" y2="19" stroke="var(--color-room-outline)" stroke-width="1"/>
      <line x1="10" y1="29" x2="54" y2="29" stroke="var(--color-room-outline)" stroke-width="2"/>
    `;
  }
  return svg;
}

function startDoorDrag(e: React.PointerEvent, type: 'door' | 'window') {
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);

  const ghost = createDoorWindowGhost(type);
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

    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (!canvasSvg) return;
    const r = canvasSvg.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;

    const state = usePlanStore.getState();
    const { canvas, room } = state;
    if (!room) return;

    const cmX = pxToCm((ev.clientX - r.left - canvas.panX) / canvas.zoom);
    const cmY = pxToCm((ev.clientY - r.top - canvas.panY) / canvas.zoom);

    const nearest = findNearestWall(cmX, cmY, room);
    if (!nearest || nearest.dist > 20) return;

    if (type === 'door') {
      // Auto hinge: hinge on the side closest to the nearest corner, always opens inward
      const hingeSide: 'left' | 'right' = nearest.t < 0.5 ? 'left' : 'right';
      const door: Door = {
        id: crypto.randomUUID(),
        wallId: nearest.wallId,
        positionOnWall: nearest.t,
        widthCm: DEFAULT_DOOR_WIDTH_CM,
        opensTo: 'inside',
        hingeSide,
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

function createColumnGhost(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);opacity:0.9;';
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '40');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.innerHTML = `
    <rect x="0" y="0" width="40" height="40" fill="var(--color-surface)" stroke="var(--color-room-outline)" stroke-width="1.5"/>
    <line x1="0" y1="40" x2="26" y2="0" stroke="var(--color-room-outline)" stroke-width="0.8" stroke-opacity="0.5"/>
    <line x1="14" y1="40" x2="40" y2="0" stroke="var(--color-room-outline)" stroke-width="0.8" stroke-opacity="0.5"/>
    <line x1="0" y1="20" x2="20" y2="0" stroke="var(--color-room-outline)" stroke-width="0.8" stroke-opacity="0.5"/>
    <line x1="20" y1="40" x2="40" y2="20" stroke="var(--color-room-outline)" stroke-width="0.8" stroke-opacity="0.5"/>
  `;
  return svg;
}

function startColumnDrag(e: React.PointerEvent) {
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);

  const ghost = createColumnGhost();
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

    const canvasSvg = document.querySelector('#canvas svg') as SVGSVGElement | null;
    if (!canvasSvg) return;
    const r = canvasSvg.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;

    const state = usePlanStore.getState();
    const { canvas, room } = state;
    if (!room) return;

    const cmX = pxToCm((ev.clientX - r.left - canvas.panX) / canvas.zoom);
    const cmY = pxToCm((ev.clientY - r.top - canvas.panY) / canvas.zoom);

    // Default 30×30 cm column; center at drop point
    const col: Column = {
      id: crypto.randomUUID(),
      widthCm: 30,
      depthCm: 30,
      position: { x: cmX - 15, y: cmY - 15 },
      rotation: 0,
    };
    state.addColumn(col);
    useUiStore.getState().setSelectedItemId(col.id);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function addToFirstWall(type: 'door' | 'window' | 'column') {
  const state = usePlanStore.getState();
  const { room } = state;
  if (!room || room.walls.length === 0) return;

  if (type === 'column') {
    // Place column at center of room bounding box
    const xs = room.points.map((p) => p.x);
    const ys = room.points.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const col: Column = { id: crypto.randomUUID(), widthCm: 30, depthCm: 30, position: { x: cx - 15, y: cy - 15 }, rotation: 0 };
    state.addColumn(col);
    useUiStore.getState().setSelectedItemId(col.id);
    return;
  }

  // Place door/window on the longest wall at t=0.5
  let bestWall = room.walls[0];
  let bestLen = 0;
  for (const wall of room.walls) {
    const a = room.points[wall.startPointIndex];
    const b = room.points[wall.endPointIndex];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen) { bestLen = len; bestWall = wall; }
  }

  if (type === 'door') {
    const door: Door = { id: crypto.randomUUID(), wallId: bestWall.id, positionOnWall: 0.5, widthCm: DEFAULT_DOOR_WIDTH_CM, opensTo: 'inside', hingeSide: 'left' };
    state.addDoor(door);
    useUiStore.getState().setSelectedItemId(door.id);
  } else {
    const win: Window = { id: crypto.randomUUID(), wallId: bestWall.id, positionOnWall: 0.5, widthCm: DEFAULT_WINDOW_WIDTH_CM };
    state.addWindow(win);
    useUiStore.getState().setSelectedItemId(win.id);
  }
}

export const DoorsWindowsSection = memo(function DoorsWindowsSection() {
  const room = usePlanStore((s) => s.room);
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const updateDoor = usePlanStore((s) => s.updateDoor);
  const removeDoor = usePlanStore((s) => s.removeDoor);
  const updateWindow = usePlanStore((s) => s.updateWindow);
  const removeWindow = usePlanStore((s) => s.removeWindow);
  const updateColumn = usePlanStore((s) => s.updateColumn);
  const removeColumn = usePlanStore((s) => s.removeColumn);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);

  const selectedDoor = room?.doors.find((d) => d.id === selectedItemId) ?? null;
  const selectedWindow = room?.windows.find((w) => w.id === selectedItemId) ?? null;
  const selectedColumn = room?.columns?.find((c) => c.id === selectedItemId) ?? null;

  if (!room) {
    return (
      <div className="px-3 py-3 text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>
        Önce bir oda oluşturun.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Draggable items */}
      <div className="p-3 border-b border-border">
        <p className="text-xs text-text-muted mb-2" style={{ fontFamily: 'var(--font-body)' }}>
          Sürükle veya çift tıkla
        </p>
        <div className="flex gap-2">
          {/* Door */}
          <div
            className="flex-1 flex flex-col items-center gap-1 p-2 rounded border border-border hover:border-primary cursor-grab select-none transition-colors duration-fast"
            style={{ background: 'var(--color-surface)', fontFamily: 'var(--font-body)' }}
            onPointerDown={(e) => startDoorDrag(e, 'door')}
            onDoubleClick={() => addToFirstWall('door')}
          >
            <svg width="32" height="24" viewBox="0 0 32 24">
              <line x1="4" y1="12" x2="10" y2="12" stroke="var(--color-room-outline)" strokeWidth="2" />
              <line x1="22" y1="12" x2="28" y2="12" stroke="var(--color-room-outline)" strokeWidth="2" />
              <line x1="10" y1="12" x2="10" y2="0" stroke="var(--color-room-outline)" strokeWidth="1.5" />
              <path d="M 10 0 A 12 12 0 0 1 22 12" fill="none" stroke="var(--color-secondary,#5E8FB5)" strokeWidth="1" strokeDasharray="3 2" />
            </svg>
            <span className="text-xs text-[var(--color-text)]">Kapı</span>
          </div>

          {/* Window */}
          <div
            className="flex-1 flex flex-col items-center gap-1 p-2 rounded border border-border hover:border-primary cursor-grab select-none transition-colors duration-fast"
            style={{ background: 'var(--color-surface)', fontFamily: 'var(--font-body)' }}
            onPointerDown={(e) => startDoorDrag(e, 'window')}
            onDoubleClick={() => addToFirstWall('window')}
          >
            <svg width="32" height="24" viewBox="0 0 32 24">
              <line x1="4" y1="12" x2="10" y2="12" stroke="var(--color-room-outline)" strokeWidth="2" />
              <line x1="22" y1="12" x2="28" y2="12" stroke="var(--color-room-outline)" strokeWidth="2" />
              <line x1="10" y1="12" x2="22" y2="12" stroke="var(--color-room-outline)" strokeWidth="1.5" />
              <line x1="10" y1="9" x2="22" y2="9" stroke="var(--color-room-outline)" strokeWidth="1" />
              <line x1="10" y1="15" x2="22" y2="15" stroke="var(--color-room-outline)" strokeWidth="1.5" />
            </svg>
            <span className="text-xs text-[var(--color-text)]">Pencere</span>
          </div>

          {/* Column */}
          <div
            className="flex-1 flex flex-col items-center gap-1 p-2 rounded border border-border hover:border-primary cursor-grab select-none transition-colors duration-fast"
            style={{ background: 'var(--color-surface)', fontFamily: 'var(--font-body)' }}
            onPointerDown={startColumnDrag}
            onDoubleClick={() => addToFirstWall('column')}
          >
            <svg width="32" height="24" viewBox="0 0 32 24">
              <rect x="8" y="4" width="16" height="16" fill="none" stroke="var(--color-room-outline)" strokeWidth="1.5" />
              <line x1="8" y1="20" x2="16" y2="4" stroke="var(--color-room-outline)" strokeWidth="0.7" strokeOpacity="0.5" />
              <line x1="12" y1="20" x2="24" y2="4" stroke="var(--color-room-outline)" strokeWidth="0.7" strokeOpacity="0.5" />
              <line x1="16" y1="20" x2="24" y2="10" stroke="var(--color-room-outline)" strokeWidth="0.7" strokeOpacity="0.5" />
              <line x1="8" y1="14" x2="14" y2="4" stroke="var(--color-room-outline)" strokeWidth="0.7" strokeOpacity="0.5" />
            </svg>
            <span className="text-xs text-[var(--color-text)]">Kolon</span>
          </div>
        </div>
      </div>

      {/* Door editing */}
      {selectedDoor && (
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--color-text)]" style={{ fontFamily: 'var(--font-body)' }}>
              Kapı
            </span>
            <button
              onClick={() => { removeDoor(selectedDoor.id); setSelectedItemId(null); }}
              className="text-xs text-text-muted hover:text-[var(--color-error,#c0392b)] cursor-pointer transition-colors duration-fast"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Sil
            </button>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>Genişlik</label>
            <input
              type="number"
              min={40} max={300}
              value={selectedDoor.widthCm}
              onChange={(e) => { const v = Number(e.target.value); if (v > 0) updateDoor(selectedDoor.id, { widthCm: v }); }}
              className="w-20 px-2 py-1 text-sm rounded border border-border bg-[var(--color-background)] text-[var(--color-text)] outline-none focus:border-primary"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>cm</span>
          </div>

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
                {side === 'left' ? 'Sol' : 'Sağ'}
              </button>
            ))}
          </div>

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
                {dir === 'inside' ? 'İçe' : 'Dışa'}
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
              Pencere
            </span>
            <button
              onClick={() => { removeWindow(selectedWindow.id); setSelectedItemId(null); }}
              className="text-xs text-text-muted hover:text-[var(--color-error,#c0392b)] cursor-pointer transition-colors duration-fast"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Sil
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>Genişlik</label>
            <input
              type="number"
              min={40} max={500}
              value={selectedWindow.widthCm}
              onChange={(e) => { const v = Number(e.target.value); if (v > 0) updateWindow(selectedWindow.id, { widthCm: v }); }}
              className="w-20 px-2 py-1 text-sm rounded border border-border bg-[var(--color-background)] text-[var(--color-text)] outline-none focus:border-primary"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>cm</span>
          </div>
        </div>
      )}

      {/* Column editing */}
      {selectedColumn && (
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--color-text)]" style={{ fontFamily: 'var(--font-body)' }}>
              Kolon
            </span>
            <button
              onClick={() => { removeColumn(selectedColumn.id); setSelectedItemId(null); }}
              className="text-xs text-text-muted hover:text-[var(--color-error,#c0392b)] cursor-pointer transition-colors duration-fast"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Sil
            </button>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>En</label>
            <LiveDimInput
              min={5} max={200}
              value={selectedColumn.widthCm}
              onLiveChange={(v) => updateColumn(selectedColumn.id, { widthCm: v, position: adjustColPos(selectedColumn, v, selectedColumn.depthCm) })}
              className="w-20 px-2 py-1 text-sm rounded border border-border bg-[var(--color-background)] text-[var(--color-text)] outline-none focus:border-primary"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>cm</span>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>Boy</label>
            <LiveDimInput
              min={5} max={200}
              value={selectedColumn.depthCm}
              onLiveChange={(v) => updateColumn(selectedColumn.id, { depthCm: v, position: adjustColPos(selectedColumn, selectedColumn.widthCm, v) })}
              className="w-20 px-2 py-1 text-sm rounded border border-border bg-[var(--color-background)] text-[var(--color-text)] outline-none focus:border-primary"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>cm</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>Açı</label>
            <LiveDimInput
              min={0} max={359}
              value={selectedColumn.rotation}
              onLiveChange={(v) => updateColumn(selectedColumn.id, { rotation: ((v % 360) + 360) % 360 })}
              className="w-20 px-2 py-1 text-sm rounded border border-border bg-[var(--color-background)] text-[var(--color-text)] outline-none focus:border-primary"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span className="text-xs text-text-muted" style={{ fontFamily: 'var(--font-body)' }}>°</span>
          </div>
        </div>
      )}
    </div>
  );
});
