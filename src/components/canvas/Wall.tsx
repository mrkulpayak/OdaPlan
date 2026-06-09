import { memo } from 'react';
import type { Wall as WallType, Point, Door as DoorType, Window as WindowType, Column } from '../../types';
import { cmToPx, segmentLength } from '../../lib/geometry';
import { DimensionLabel } from './DimensionLabel';

interface Props {
  wall: WallType;
  points: Point[];
  doors: DoorType[];
  windows: WindowType[];
  /** Columns snapped to this wall — used to create gaps in the wall line when wallsLocked */
  wallColumns?: Column[];
  viewRotation: number;
  zoom: number;
  isSelected: boolean;
  onCommitLength: (wallId: string, newLengthCm: number) => void;
  onToggleLock: (wallId: string) => void;
  onTogglePin: (wallId: string) => void;
  /** Kept for API compatibility — Door/Window components render in Room.tsx overlay */
  onSelectDoor?: (id: string) => void;
  /** Kept for API compatibility — Door/Window components render in Room.tsx overlay */
  onSelectWindow?: (id: string) => void;
  onWallClick: (wallId: string, e: React.PointerEvent) => void;
  isDraggable?: boolean;
  wallsLocked?: boolean;
}

export const Wall = memo(function Wall({
  wall, points, doors, windows, wallColumns, viewRotation, zoom,
  onCommitLength, onToggleLock, onTogglePin, onWallClick, isDraggable, wallsLocked,
}: Props) {
  const aCm = points[wall.startPointIndex];
  const bCm = points[wall.endPointIndex];

  if (!aCm || !bCm) return null;

  const aPx = { x: cmToPx(aCm.x), y: cmToPx(aCm.y) };
  const bPx = { x: cmToPx(bCm.x), y: cmToPx(bCm.y) };
  const lengthCm = segmentLength(aCm, bCm);

  // Outward normal: use polygon winding order (shoelace signed area) for reliability.
  // Centroid-of-vertices fails for concave rooms (L-shape etc.) because the average
  // of corner points can fall outside the actual room area, causing wrong normals.
  let signedArea = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    signedArea += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  // signedArea > 0 → CCW in math (CW on screen with y-down)
  // For CW-on-screen polygon, interior is to the RIGHT of each A→B edge.
  // Wall is stored A→B, so outward = LEFT perp of A→B = (-dy, dx)/len.
  // For CCW-on-screen polygon, flip.
  const wdxCm = bCm.x - aCm.x, wdyCm = bCm.y - aCm.y; // A→B direction
  const wallLenCm = Math.hypot(wdxCm, wdyCm) || 1;
  const ux = wdxCm / wallLenCm, uy = wdyCm / wallLenCm;
  // Right perp of A→B (rotate 90° CW): (uy, -ux)
  // In SVG (y-down): CW polygon has signedArea > 0; interior is to the RIGHT of each A→B edge,
  // so exterior (outward) is to the LEFT = (-uy, ux). But RIGHT perp = (uy,-ux) in SVG y-down
  // actually points OUTSIDE for CW. Verify: top wall (1,0) → right perp (0,-1) = up = outside ✓
  const rightNx = uy, rightNy = -ux;
  // CW on screen (signedArea > 0) → right perp is outward
  // CCW on screen (signedArea < 0) → left perp is outward (negate right perp)
  const outwardNormal = signedArea > 0
    ? { x: rightNx, y: rightNy }
    : { x: -rightNx, y: -rightNy };

  // Compute gaps in wall line for doors and windows
  // Each gap: [t_start, t_end] as 0-1 normalized along wall
  const gaps: Array<[number, number]> = [];

  for (const door of doors) {
    const half = door.widthCm / (2 * lengthCm);
    gaps.push([door.positionOnWall - half, door.positionOnWall + half]);
  }
  for (const win of windows) {
    const half = win.widthCm / (2 * lengthCm);
    gaps.push([win.positionOnWall - half, win.positionOnWall + half]);
  }

  // When wallsLocked, gap the wall line where any snapped column physically touches this wall
  if (wallsLocked && wallColumns && lengthCm > 0) {
    const ux = (bCm.x - aCm.x) / lengthCm;
    const uy = (bCm.y - aCm.y) / lengthCm;
    for (const col of wallColumns) {
      const θ = (col.rotation * Math.PI) / 180;
      const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
      const cx = col.position.x + col.widthCm / 2;
      const cy = col.position.y + col.depthCm / 2;
      const hw = col.widthCm / 2, hd = col.depthCm / 2;
      const corners = [
        { lx: -hw, ly: -hd }, { lx: hw, ly: -hd },
        { lx: hw,  ly:  hd }, { lx: -hw, ly: hd },
      ].map(({ lx, ly }) => ({
        x: cx + lx * cosθ - ly * sinθ,
        y: cy + lx * sinθ + ly * cosθ,
      }));
      // Only create a gap if the column is touching this wall (min perpendicular distance < 2 cm)
      const minPerp = Math.min(...corners.map(c => {
        const dx = c.x - aCm.x, dy = c.y - aCm.y;
        return Math.abs(dx * (-uy) + dy * ux); // perpendicular distance
      }));
      if (minPerp > 2) continue;
      const ts = corners.map(c => (c.x - aCm.x) * ux + (c.y - aCm.y) * uy);
      const tMin = Math.min(...ts) / lengthCm;
      const tMax = Math.max(...ts) / lengthCm;
      gaps.push([tMin, tMax]);
    }
  }

  // Sort gaps and build wall segments
  gaps.sort((a, b) => a[0] - b[0]);

  const wallSegments: Array<[number, number]> = [];
  let cur = 0;
  for (const [gs, ge] of gaps) {
    const s = Math.max(0, gs);
    const e = Math.min(1, ge);
    if (s > cur) wallSegments.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (cur < 1) wallSegments.push([cur, 1]);

  const dx = bPx.x - aPx.x;
  const dy = bPx.y - aPx.y;

  const wallLines = gaps.length === 0
    ? [{ x1: aPx.x, y1: aPx.y, x2: bPx.x, y2: bPx.y }]
    : wallSegments.map(([t1, t2]) => ({
        x1: aPx.x + t1 * dx, y1: aPx.y + t1 * dy,
        x2: aPx.x + t2 * dx, y2: aPx.y + t2 * dy,
      }));

  return (
    <g>
      {/* Invisible wide hit area for wall click / drag — hidden when walls are locked */}
      {!wallsLocked && (
        <line
          x1={aPx.x} y1={aPx.y} x2={bPx.x} y2={bPx.y}
          stroke="transparent"
          strokeWidth={12}
          style={{ cursor: isDraggable ? 'grab' : 'pointer' }}
          onPointerDown={(e) => { e.stopPropagation(); onWallClick(wall.id, e); }}
        />
      )}
      {wallLines.map((seg, i) => (
        <line
          key={i}
          x1={seg.x1} y1={seg.y1}
          x2={seg.x2} y2={seg.y2}
          stroke="var(--color-room-outline)"
          strokeWidth={1.5}
          strokeLinecap="round"
          style={{ pointerEvents: 'none' }}
        />
      ))}

      {/* Note: Door and Window components are rendered in Room.tsx AFTER furniture
          so they appear on top. Wall only draws the gap in the wall line here. */}

      {/* Dimension labels hidden when walls are globally locked */}
      {!wallsLocked && (
        <DimensionLabel
          wallId={wall.id}
          a={aPx}
          b={bPx}
          lengthCm={lengthCm}
          isLocked={wall.isLengthLocked}
          isPinned={wall.isPinned}
          outwardNormal={outwardNormal}
          onCommit={onCommitLength}
          onToggleLock={onToggleLock}
          onTogglePin={onTogglePin}
          viewRotation={viewRotation}
          zoom={zoom}
        />
      )}
    </g>
  );
});
