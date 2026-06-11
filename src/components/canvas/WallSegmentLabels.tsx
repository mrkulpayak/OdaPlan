import { useState } from 'react';
import { cmToPx } from '../../lib/geometry';
import { usePlanStore } from '../../store/planStore';
import { adjustColPosForCorner } from './ColumnItem';
import type { Column, Point } from '../../types';

// ── Editable label (shared) ───────────────────────────────────────────────────
interface EditableLblProps {
  midX: number; midY: number;
  distCm: number;
  zoom: number;
  onCommit: (d: number) => void;
}
function EditableLbl({ midX, midY, distCm, zoom, onCommit }: EditableLblProps) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const fs = Math.max(8, Math.min(10, 9 / zoom));

  if (editing) {
    return (
      <foreignObject
        data-interactive="true"
        x={midX - 22 / zoom} y={midY - 9 / zoom}
        width={44 / zoom} height={18 / zoom}
        style={{ overflow: 'visible' }}
      >
        <div style={{
          transform: `scale(${1 / zoom})`, transformOrigin: 'top left',
          width: '44px', height: '18px',
        }}>
          <input
            type="number" value={val} autoFocus
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { const n = parseFloat(val); if (!isNaN(n)) onCommit(n); setEditing(false); }
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={() => { const n = parseFloat(val); if (!isNaN(n)) onCommit(n); setEditing(false); }}
            style={{
              width: '100%', height: '100%',
              fontSize: '10px', fontFamily: 'var(--font-mono)',
              textAlign: 'center',
              border: '1px solid var(--color-primary)',
              borderRadius: '2px', outline: 'none', padding: '1px',
              background: 'var(--color-surface)', boxSizing: 'border-box',
            }}
          />
        </div>
      </foreignObject>
    );
  }

  return (
    <text
      data-interactive="true"
      x={midX} y={midY}
      textAnchor="middle" dominantBaseline="middle"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: `${fs}px`,
        fill: 'var(--color-primary)',
        cursor: 'text', userSelect: 'none',
      }}
      onClick={() => { setVal(String(Math.round(distCm))); setEditing(true); }}
    >{Math.round(distCm)}</text>
  );
}

// ── Segment data ──────────────────────────────────────────────────────────────
interface Segment {
  kind: 'gap' | 'door' | 'window' | 'column';
  id?: string;
  startCm: number;
  endCm: number;
  spanCm: number;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  wallId: string;
  wallStart: Point; // cm
  wallEnd: Point;   // cm
  zoom: number;
}

/**
 * Shows all segment labels for a wall when any element on it is selected.
 * Renders: [gap] [item] [gap] [item] [gap] ...
 * All labels are editable: gaps move adjacent items, item spans change widthCm.
 */
export function WallSegmentLabels({ wallId, wallStart, wallEnd, zoom }: Props) {
  const room = usePlanStore(s => s.room);
  const { updateDoor, updateWindow, updateColumn } = usePlanStore.getState();

  if (!room) return null;

  const wdx = wallEnd.x - wallStart.x;
  const wdy = wallEnd.y - wallStart.y;
  const wallLen = Math.hypot(wdx, wdy);
  if (wallLen < 1) return null;

  const ux = wdx / wallLen;
  const uy = wdy / wallLen;
  const Ax = wallStart.x, Ay = wallStart.y;

  // ── Collect all items on this wall ────────────────────────────────────────
  const items: { id: string; kind: 'door' | 'window' | 'column'; startCm: number; endCm: number }[] = [];

  for (const d of room.doors) {
    if (d.wallId !== wallId) continue;
    const ct = d.positionOnWall * wallLen;
    items.push({ id: d.id, kind: 'door', startCm: ct - d.widthCm / 2, endCm: ct + d.widthCm / 2 });
  }
  for (const w of room.windows) {
    if (w.wallId !== wallId) continue;
    const ct = w.positionOnWall * wallLen;
    items.push({ id: w.id, kind: 'window', startCm: ct - w.widthCm / 2, endCm: ct + w.widthCm / 2 });
  }
  for (const col of (room.columns ?? [])) {
    // Use physical proximity to support corner columns touching two walls
    const cxCm = col.position.x + col.widthCm / 2;
    const cyCm = col.position.y + col.depthCm / 2;
    const θ = (col.rotation * Math.PI) / 180;
    const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
    const hw = col.widthCm / 2, hd = col.depthCm / 2;
    const corners = [
      { lx: -hw, ly: -hd }, { lx: hw, ly: -hd },
      { lx:  hw, ly:  hd }, { lx: -hw, ly:  hd },
    ].map(({ lx, ly }) => ({
      x: cxCm + lx * cosθ - ly * sinθ,
      y: cyCm + lx * sinθ + ly * cosθ,
    }));
    const minPerp = Math.min(...corners.map(c => {
      const dx = c.x - Ax, dy = c.y - Ay;
      return Math.abs(dx * (-uy) + dy * ux);
    }));
    if (minPerp > 2) continue;
    const ts = corners.map(c => (c.x - Ax) * ux + (c.y - Ay) * uy);
    const startCm = Math.max(0, Math.min(...ts));
    const endCm   = Math.min(wallLen, Math.max(...ts));
    if (endCm - startCm < 0.5) continue;
    items.push({ id: col.id, kind: 'column', startCm, endCm });
  }

  items.sort((a, b) => a.startCm - b.startCm);

  // ── Build segment list ────────────────────────────────────────────────────
  const segments: Segment[] = [];
  let prev = 0;
  for (const item of items) {
    const s = Math.max(0, item.startCm);
    const e = Math.min(wallLen, item.endCm);
    if (s > prev + 0.1) {
      segments.push({ kind: 'gap', startCm: prev, endCm: s, spanCm: s - prev });
    }
    segments.push({ id: item.id, kind: item.kind, startCm: s, endCm: e, spanCm: e - s });
    prev = e;
  }
  if (wallLen - prev > 0.1) {
    segments.push({ kind: 'gap', startCm: prev, endCm: wallLen, spanCm: wallLen - prev });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const CM = cmToPx(1);
  const OFF = 22 / zoom;
  const px = uy, py = -ux; // outward perpendicular
  const Apx = cmToPx(Ax), Apy = cmToPx(Ay);

  return (
    <g>
      {segments.map((seg, i) => {
        const midCm = (seg.startCm + seg.endCm) / 2;
        const midX = Apx + midCm * ux * CM + OFF * px;
        const midY = Apy + midCm * uy * CM + OFF * py;

        const onCommit = (newVal: number) => {
          if (newVal < 0) return;
          const { room: cur } = usePlanStore.getState();
          if (!cur) return;

          if (seg.kind === 'door') {
            if (newVal < 10) return;
            updateDoor(seg.id!, { widthCm: newVal });

          } else if (seg.kind === 'window') {
            if (newVal < 10) return;
            updateWindow(seg.id!, { widthCm: newVal });

          } else if (seg.kind === 'column') {
            const col = cur.columns?.find(c => c.id === seg.id);
            if (!col?.snappedToWall) return;
            const side = col.snappedToWall.side;
            const isAlongWall = side === 'top' || side === 'bottom';
            const newWc = isAlongWall ? Math.max(5, newVal) : col.widthCm;
            const newDc = isAlongWall ? col.depthCm : Math.max(5, newVal);
            // Start with the wall-perpendicular adjustment (keeps wall face flush)
            let newPos = adjustColPosForCorner(col, newWc, newDc, cur);
            const newHalfW = isAlongWall ? newWc / 2 : newDc / 2;
            const newCxAfter = newPos.x + newWc / 2;
            const newCyAfter = newPos.y + newDc / 2;
            const newTAlong = (newCxAfter - Ax) * ux + (newCyAfter - Ay) * uy;

            // Detect which lateral face of the column is flush against a perpendicular wall.
            // That face must stay fixed so the column grows away from the corner.
            // The lateral faces are at t = seg.startCm (left/start face) and t = seg.endCm (right/end face).
            // Perpendicular wall normal: (-uy, ux)
            const FLUSH_TOL = 3; // cm
            const isFaceFlushWithWall = (tAlong: number) => {
              // World position of the lateral face midpoint
              const fx = Ax + tAlong * ux;
              const fy = Ay + tAlong * uy;
              for (const w of cur.walls) {
                if (w.id === wallId) continue; // skip the same wall
                const wA = cur.points[w.startPointIndex];
                const wB = cur.points[w.endPointIndex];
                const wLen = Math.hypot(wB.x - wA.x, wB.y - wA.y);
                if (wLen < 1) continue;
                const wux = (wB.x - wA.x) / wLen;
                const wuy = (wB.y - wA.y) / wLen;
                const dx = fx - wA.x, dy = fy - wA.y;
                const perp = Math.abs(-dx * wuy + dy * wux);
                const along = dx * wux + dy * wuy;
                if (perp < FLUSH_TOL && along >= -FLUSH_TOL && along <= wLen + FLUSH_TOL) return true;
              }
              return false;
            };

            const endFlush   = isFaceFlushWithWall(seg.endCm);
            const startFlush = isFaceFlushWithWall(seg.startCm);
            // Prefer anchoring the flush side; if both or neither, fall back to wall-endpoint proximity
            const anchorEnd = endFlush
              ? true
              : startFlush
                ? false
                : seg.endCm > wallLen - 2; // fallback: near wall endpoint

            const desiredTAlong = anchorEnd
              ? seg.endCm - newHalfW   // anchor end → grow toward start
              : seg.startCm + newHalfW; // anchor start → grow toward end
            const deltaAlong = desiredTAlong - newTAlong;
            newPos = { x: newPos.x + deltaAlong * ux, y: newPos.y + deltaAlong * uy };
            updateColumn(seg.id!, {
              widthCm: newWc,
              depthCm: newDc,
              position: newPos,
            });

          } else if (seg.kind === 'gap') {
            // Prefer to move the right neighbor; if none, move the left neighbor
            const nextSeg = segments[i + 1];
            const prevSeg = segments[i - 1];

            const moveItem = (itemId: string, kind: 'door' | 'window' | 'column', newStart: number) => {
              const r = usePlanStore.getState().room;
              if (!r) return;
              if (kind === 'door') {
                const d = r.doors.find(x => x.id === itemId);
                if (!d) return;
                const nc = newStart + d.widthCm / 2;
                updateDoor(itemId, { positionOnWall: Math.max(0, Math.min(1, nc / wallLen)) });
              } else if (kind === 'window') {
                const w = r.windows.find(x => x.id === itemId);
                if (!w) return;
                const nc = newStart + w.widthCm / 2;
                updateWindow(itemId, { positionOnWall: Math.max(0, Math.min(1, nc / wallLen)) });
              } else if (kind === 'column') {
                const col = r.columns?.find(c => c.id === itemId);
                if (!col?.snappedToWall) return;
                const side = col.snappedToWall.side;
                const halfW = (side === 'top' || side === 'bottom') ? col.widthCm / 2 : col.depthCm / 2;
                const cxCm = col.position.x + col.widthCm / 2;
                const cyCm = col.position.y + col.depthCm / 2;
                const currentT = (cxCm - Ax) * ux + (cyCm - Ay) * uy;
                const newT = newStart + halfW;
                const delta = { x: (newT - currentT) * ux, y: (newT - currentT) * uy };
                updateColumn(itemId, { position: { x: col.position.x + delta.x, y: col.position.y + delta.y } });
              }
            };

            if (nextSeg?.id && nextSeg.kind !== 'gap') {
              moveItem(nextSeg.id, nextSeg.kind as 'door' | 'window' | 'column', newVal);
            } else if (prevSeg?.id && prevSeg.kind !== 'gap') {
              // Move prev item so its end = wallLen - newVal
              const newEnd = wallLen - newVal;
              const r = usePlanStore.getState().room;
              if (!r) return;
              if (prevSeg.kind === 'door') {
                const d = r.doors.find(x => x.id === prevSeg.id);
                if (!d) return;
                const nc = newEnd - d.widthCm / 2;
                updateDoor(prevSeg.id, { positionOnWall: Math.max(0, Math.min(1, nc / wallLen)) });
              } else if (prevSeg.kind === 'window') {
                const w = r.windows.find(x => x.id === prevSeg.id);
                if (!w) return;
                const nc = newEnd - w.widthCm / 2;
                updateWindow(prevSeg.id, { positionOnWall: Math.max(0, Math.min(1, nc / wallLen)) });
              } else if (prevSeg.kind === 'column') {
                const col = r.columns?.find(c => c.id === prevSeg.id);
                if (!col?.snappedToWall) return;
                const side = col.snappedToWall.side;
                const halfW = (side === 'top' || side === 'bottom') ? col.widthCm / 2 : col.depthCm / 2;
                const cxCm = col.position.x + col.widthCm / 2;
                const cyCm = col.position.y + col.depthCm / 2;
                const currentT = (cxCm - Ax) * ux + (cyCm - Ay) * uy;
                const newT = newEnd - halfW;
                const delta = { x: (newT - currentT) * ux, y: (newT - currentT) * uy };
                updateColumn(prevSeg.id, { position: { x: col.position.x + delta.x, y: col.position.y + delta.y } });
              }
            }
          }
        };

        return (
          <EditableLbl
            key={`wseg-${wallId}-${i}`}
            midX={midX} midY={midY}
            distCm={seg.spanCm}
            zoom={zoom}
            onCommit={onCommit}
          />
        );
      })}
    </g>
  );
}
