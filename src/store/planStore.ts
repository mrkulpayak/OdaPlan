import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlanState, Room, Wall, FurnitureInstance, CanvasState, Point, Door, Window } from '../types';
import { segmentLength, segmentAngleDegrees, cmToPx, faceMidpointOffset } from '../lib/geometry';
import { useCatalogStore } from './catalogStore';

interface PlanActions {
  setRoom: (room: Room | null) => void;
  createRoomFromTemplate: (type: RoomTemplate) => void;
  updateWallLength: (wallId: string, newLengthCm: number, canvasWidth: number, canvasHeight: number) => { blocked: boolean; reason?: string };
  toggleWallLock: (wallId: string) => void;
  addFurnitureInstance: (instance: FurnitureInstance) => void;
  updateFurnitureInstance: (id: string, updates: Partial<FurnitureInstance>) => void;
  removeFurnitureInstance: (id: string) => void;
  rotateFurniture: (id: string) => void;
  addDoor: (door: Door) => void;
  updateDoor: (id: string, updates: Partial<Door>) => void;
  removeDoor: (id: string) => void;
  addWindow: (window: Window) => void;
  updateWindow: (id: string, updates: Partial<Window>) => void;
  removeWindow: (id: string) => void;
  createRoomFromPoints: (points: Point[]) => void;
  addAngleConstraint: (sharedPointIndex: number, angleDeg: number) => void;
  removeConstraint: (constraintId: string) => void;
  toggleWallPin: (wallId: string) => void;
  moveRoomPoint: (pointIndex: number, newPosCm: Point) => void;
  setCanvasState: (canvas: Partial<CanvasState>) => void;
  fitRoomToCanvas: (canvasWidth: number, canvasHeight: number) => void;
  resetPlan: () => void;
}

export type RoomTemplate = 'rectangle' | 'square' | 'l-shape' | 'niche' | 'column' | 'angled';

const defaultCanvas: CanvasState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  viewRotation: 0,
  showDimensionsOnExport: true,
};

const initialState: PlanState = {
  version: 1,
  room: null,
  furnitureInstances: [],
  canvas: defaultCanvas,
};

function makeId() {
  return crypto.randomUUID();
}

function computeFitTransform(points: Point[], canvasWidth: number, canvasHeight: number) {
  const xs = points.map((p) => cmToPx(p.x));
  const ys = points.map((p) => cmToPx(p.y));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const roomW = maxX - minX || 1;
  const roomH = maxY - minY || 1;
  // Extra padding for dimension labels (labels sit outside walls)
  const labelPadding = 60;
  const availW = canvasWidth - labelPadding * 2;
  const availH = canvasHeight - labelPadding * 2;
  const zoom = Math.min(availW / roomW, availH / roomH, 2);
  const panX = canvasWidth / 2 - ((minX + maxX) / 2) * zoom;
  const panY = canvasHeight / 2 - ((minY + maxY) / 2) * zoom;
  return { zoom, panX, panY };
}

function buildRoom(points: Point[]): Room {
  const walls: Wall[] = points.map((_, i) => ({
    id: makeId(),
    startPointIndex: i,
    endPointIndex: (i + 1) % points.length,
    isLengthLocked: false,
    isPinned: false,
  }));
  return { points, walls, doors: [], windows: [], constraints: [] };
}

function templatePoints(type: RoomTemplate): Point[] {
  switch (type) {
    case 'rectangle': return [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 },
    ];
    case 'square': return [
      { x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 },
    ];
    case 'l-shape': return [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 },
      { x: 200, y: 200 }, { x: 200, y: 350 }, { x: 0, y: 350 },
    ];
    case 'niche': return [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 },
      { x: 250, y: 300 }, { x: 250, y: 200 }, { x: 150, y: 200 },
      { x: 150, y: 300 }, { x: 0, y: 300 },
    ];
    case 'column': return [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 },
    ];
    case 'angled': return [
      { x: 0, y: 0 }, { x: 350, y: 0 }, { x: 400, y: 80 },
      { x: 400, y: 300 }, { x: 0, y: 300 },
    ];
    default: return [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 },
    ];
  }
}

export const usePlanStore = create<PlanState & PlanActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setRoom: (room) => set({ room }),

      createRoomFromTemplate: (type) => {
        const points = templatePoints(type);
        const room = buildRoom(points);
        set((s) => ({
          room,
          furnitureInstances: [],
          canvas: { ...s.canvas, viewRotation: 0 },
        }));
      },

      updateWallLength: (wallId, newLengthCm, canvasWidth, canvasHeight) => {
        const state = get();
        if (!state.room) return { blocked: false };
        const wall = state.room.walls.find((w) => w.id === wallId);
        if (!wall) return { blocked: false };

        if (wall.isPinned) {
          return { blocked: true, reason: 'Bu duvar tam olarak sabitlenmiş. Sabitlemeyi kaldırarak ölçüyü değiştirebilirsiniz.' };
        }
        if (wall.isLengthLocked) {
          return { blocked: true, reason: 'Bu duvarın uzunluğu kilitli. Kilidi açarak ölçüyü değiştirebilirsiniz.' };
        }

        const points = [...state.room.points.map((p) => ({ ...p }))];
        const a = points[wall.startPointIndex];
        const b = points[wall.endPointIndex];
        const currentLen = segmentLength(a, b);
        if (currentLen === 0) return { blocked: false };

        const angle = (segmentAngleDegrees(a, b) * Math.PI) / 180;
        points[wall.endPointIndex] = {
          x: a.x + newLengthCm * Math.cos(angle),
          y: a.y + newLengthCm * Math.sin(angle),
        };

        const newRoom = { ...state.room, points };
        const fit = computeFitTransform(points, canvasWidth, canvasHeight);
        set({ room: newRoom, canvas: { ...state.canvas, ...fit } });
        return { blocked: false };
      },

      toggleWallLock: (wallId) => {
        set((s) => {
          if (!s.room) return s;
          const wall = s.room.walls.find((w) => w.id === wallId);
          if (!wall) return s;
          // Capture current length when locking so compass constraint can use it
          const currentLength = segmentLength(
            s.room.points[wall.startPointIndex],
            s.room.points[wall.endPointIndex]
          );
          return {
            room: {
              ...s.room,
              walls: s.room.walls.map((w) =>
                w.id === wallId
                  ? {
                      ...w,
                      isLengthLocked: !w.isLengthLocked,
                      lockedLength: !w.isLengthLocked ? currentLength : w.lockedLength,
                    }
                  : w
              ),
            },
          };
        });
      },

      addFurnitureInstance: (instance) =>
        set((s) => ({ furnitureInstances: [...s.furnitureInstances, instance] })),

      updateFurnitureInstance: (id, updates) =>
        set((s) => ({
          furnitureInstances: s.furnitureInstances.map((fi) =>
            fi.id === id ? { ...fi, ...updates } : fi
          ),
        })),

      removeFurnitureInstance: (id) =>
        set((s) => ({
          furnitureInstances: s.furnitureInstances.filter((fi) => fi.id !== id),
        })),

      rotateFurniture: (id) =>
        set((s) => ({
          furnitureInstances: s.furnitureInstances.map((fi) => {
            if (fi.id !== id) return fi;
            const newRotation = (fi.rotation + 90) % 360;
            return { ...fi, rotation: newRotation };
          }),
        })),

      addDoor: (door) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, doors: [...s.room.doors, door] } };
        }),

      updateDoor: (id, updates) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, doors: s.room.doors.map((d) => d.id === id ? { ...d, ...updates } : d) } };
        }),

      removeDoor: (id) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, doors: s.room.doors.filter((d) => d.id !== id) } };
        }),

      addWindow: (window) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, windows: [...s.room.windows, window] } };
        }),

      updateWindow: (id, updates) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, windows: s.room.windows.map((w) => w.id === id ? { ...w, ...updates } : w) } };
        }),

      removeWindow: (id) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, windows: s.room.windows.filter((w) => w.id !== id) } };
        }),

      createRoomFromPoints: (points) => {
        const room = buildRoom(points);
        set((s) => ({
          room,
          furnitureInstances: [],
          canvas: { ...s.canvas, viewRotation: 0 },
        }));
      },

      addAngleConstraint: (sharedPointIndex, angleDeg) =>
        set((s) => {
          if (!s.room) return s;

          // Find the two walls that meet at this corner
          const armWalls: Wall[] = s.room.walls.filter(
            (w) => w.startPointIndex === sharedPointIndex || w.endPointIndex === sharedPointIndex
          );
          if (armWalls.length < 2) {
            // Not a real corner — just save the constraint without repositioning
            const filtered = s.room.constraints.filter((c) => c.sharedPointIndex !== sharedPointIndex);
            return { room: { ...s.room, constraints: [...filtered, { id: makeId(), type: 'angle' as const, sharedPointIndex, angleDeg }] } };
          }

          const wall0 = armWalls[0];
          const wall1 = armWalls[1];
          const arm0Idx = wall0.startPointIndex === sharedPointIndex ? wall0.endPointIndex : wall0.startPointIndex;
          const arm1Idx = wall1.startPointIndex === sharedPointIndex ? wall1.endPointIndex : wall1.startPointIndex;

          // Fixed arm = pinned wall's arm (if any), otherwise arm0
          // Moving arm = the other one
          const fixedArmIdx = wall1.isPinned ? arm1Idx : arm0Idx;
          const movingArmIdx = wall1.isPinned ? arm0Idx : arm1Idx;

          const shared = s.room.points[sharedPointIndex];
          const fixedPt = s.room.points[fixedArmIdx];
          const movingPt = s.room.points[movingArmIdx];

          // Direction from shared toward fixed arm
          const fdx = fixedPt.x - shared.x;
          const fdy = fixedPt.y - shared.y;
          const fLen = Math.hypot(fdx, fdy);

          // Distance of the moving arm from shared (preserve wall length)
          const mdx = movingPt.x - shared.x;
          const mdy = movingPt.y - shared.y;
          const mLen = Math.hypot(mdx, mdy);

          let newPoints = s.room.points;

          if (fLen > 0.1 && mLen > 0.1) {
            const fux = fdx / fLen;
            const fuy = fdy / fLen;

            const rad = (angleDeg * Math.PI) / 180;
            const cos = Math.cos(rad), sin = Math.sin(rad);

            // Two candidate directions at ±angleDeg from fixed arm
            const d1 = { x: fux * cos - fuy * sin, y: fux * sin + fuy * cos };
            const d2 = { x: fux * cos + fuy * sin, y: -fux * sin + fuy * cos };

            // Pick the side closest to the moving arm's current direction
            const useD1 = (d1.x * mdx + d1.y * mdy) >= (d2.x * mdx + d2.y * mdy);
            const dir = useD1 ? d1 : d2;

            // Reposition moving arm: same distance from shared, new direction
            const newMovingPt = {
              x: shared.x + mLen * dir.x,
              y: shared.y + mLen * dir.y,
            };
            newPoints = s.room.points.map((p, i) => i === movingArmIdx ? newMovingPt : p);
          }

          // Save constraint and apply the repositioned points
          const filtered = s.room.constraints.filter((c) => c.sharedPointIndex !== sharedPointIndex);
          const constraint = { id: makeId(), type: 'angle' as const, sharedPointIndex, angleDeg };
          return { room: { ...s.room, points: newPoints, constraints: [...filtered, constraint] } };
        }),

      removeConstraint: (constraintId) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, constraints: s.room.constraints.filter((c) => c.id !== constraintId) } };
        }),

      toggleWallPin: (wallId) =>
        set((s) => {
          if (!s.room) return s;
          return {
            room: {
              ...s.room,
              walls: s.room.walls.map((w) =>
                w.id === wallId ? { ...w, isPinned: !w.isPinned } : w
              ),
            },
          };
        }),

      moveRoomPoint: (pointIndex, newPosCm) => {
        const state = get();
        if (!state.room) return;

        const connectedWalls = state.room.walls.filter(
          (w) => w.startPointIndex === pointIndex || w.endPointIndex === pointIndex
        );

        // ── Pinned wall block ────────────────────────────────────────────────
        // If this point belongs to a pinned wall, it is fully immovable.
        if (connectedWalls.some((w) => w.isPinned)) return;

        // Start with desired position
        const newPoints = state.room.points.map((p, i) =>
          i === pointIndex ? newPosCm : p
        );

        // ── Angle constraints ────────────────────────────────────────────────
        // For each locked corner, handle two cases:
        //   Case A – arm endpoint is being dragged: project it onto the ray that
        //            maintains the locked angle relative to the OTHER (fixed) arm.
        //   Case B – shared corner itself is being dragged: translate both arm
        //            endpoints by the same delta (rigid-body — angle is preserved).
        for (const c of state.room.constraints) {
          const sIdx: number = c.sharedPointIndex;
          const armWalls: Wall[] = state.room.walls.filter(
            (w) => w.startPointIndex === sIdx || w.endPointIndex === sIdx
          );
          if (armWalls.length < 2) continue;

          // Arm endpoint indices (the non-shared ends of the two walls)
          const aIdx = armWalls[0].startPointIndex === sIdx
            ? armWalls[0].endPointIndex
            : armWalls[0].startPointIndex;
          const bIdx = armWalls[1].startPointIndex === sIdx
            ? armWalls[1].endPointIndex
            : armWalls[1].startPointIndex;

          const angleRad = ((c.angleDeg ?? 90) * Math.PI) / 180;
          const sharedPt = state.room.points[sIdx]; // always original — shared corner hasn't moved in Case A

          if (pointIndex === sIdx) {
            // ── Case B: shared corner drag → translate both arm endpoints ────
            const dX = newPoints[sIdx].x - sharedPt.x;
            const dY = newPoints[sIdx].y - sharedPt.y;
            // Don't translate arm endpoints that belong to a pinned wall
            const aPinned = state.room.walls.some(
              (w) => w.isPinned && (w.startPointIndex === aIdx || w.endPointIndex === aIdx)
            );
            const bPinned = state.room.walls.some(
              (w) => w.isPinned && (w.startPointIndex === bIdx || w.endPointIndex === bIdx)
            );
            if (!aPinned) {
              newPoints[aIdx] = { x: state.room.points[aIdx].x + dX, y: state.room.points[aIdx].y + dY };
            }
            if (!bPinned) {
              newPoints[bIdx] = { x: state.room.points[bIdx].x + dX, y: state.room.points[bIdx].y + dY };
            }

          } else if (pointIndex === aIdx || pointIndex === bIdx) {
            // ── Case A: arm endpoint drag → project onto locked-angle ray ───
            // Fixed arm: the arm NOT being dragged (use original position — it didn't move)
            const fixedIdx = pointIndex === aIdx ? bIdx : aIdx;
            const fixedPt  = state.room.points[fixedIdx];

            // Direction from shared corner toward fixed arm endpoint
            const fdx = fixedPt.x - sharedPt.x;
            const fdy = fixedPt.y - sharedPt.y;
            const fLen = Math.hypot(fdx, fdy);
            if (fLen < 0.1) continue;
            const fux = fdx / fLen;
            const fuy = fdy / fLen;

            // Current direction of the moving arm (selects which side ±angle lands on)
            const origPt  = state.room.points[pointIndex];
            const curDx   = origPt.x - sharedPt.x;
            const curDy   = origPt.y - sharedPt.y;

            // Two candidate directions at ±angleDeg from the fixed arm direction
            const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
            const d1 = { x: fux * cos - fuy * sin, y: fux * sin + fuy * cos };
            const d2 = { x: fux * cos + fuy * sin, y: -fux * sin + fuy * cos };

            // Choose the candidate closest to the current wall orientation
            const useD1 = (d1.x * curDx + d1.y * curDy) >= (d2.x * curDx + d2.y * curDy);
            const dir = useD1 ? d1 : d2;

            // Project the desired (already constraint-modified) new position onto this ray
            const desired = newPoints[pointIndex]; // may already be adjusted by previous constraints
            const dx = desired.x - sharedPt.x;
            const dy = desired.y - sharedPt.y;
            const proj = dx * dir.x + dy * dir.y;
            const wallLen = Math.max(5, proj); // minimum 5 cm wall

            newPoints[pointIndex] = {
              x: sharedPt.x + wallLen * dir.x,
              y: sharedPt.y + wallLen * dir.y,
            };
          }
          // pointIndex unrelated to this constraint → skip
        }

        // ── Length (compass) constraint ──────────────────────────────────────
        // For each length-locked wall connected to this point:
        // The other endpoint is the "pivot". The dragged point can only move
        // on a circle of radius = locked length centered at the pivot.
        // This replaces the old "block entirely if length-locked" behavior.
        for (const wall of connectedWalls) {
          if (!wall.isLengthLocked) continue;
          const lockedLen = wall.lockedLength ?? segmentLength(
            state.room.points[wall.startPointIndex],
            state.room.points[wall.endPointIndex]
          );
          if (lockedLen < 1) continue;

          const otherIdx = wall.startPointIndex === pointIndex
            ? wall.endPointIndex
            : wall.startPointIndex;
          // Use the ORIGINAL (pre-move) position of the other endpoint as pivot
          const pivot = state.room.points[otherIdx];

          const dx = newPoints[pointIndex].x - pivot.x;
          const dy = newPoints[pointIndex].y - pivot.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.1) continue; // avoid division by zero if right on pivot

          // Project onto circle of radius lockedLen
          newPoints[pointIndex] = {
            x: pivot.x + (dx / dist) * lockedLen,
            y: pivot.y + (dy / dist) * lockedLen,
          };
        }

        // --- Move wall-snapped furniture with the wall ---
        // The furniture's snapped FACE MIDPOINT must stay flush on the wall.
        // The along-wall distance is measured from the FIXED (non-dragged) wall endpoint
        // so the furniture pivots around that point exactly as the wall does.
        const { products } = useCatalogStore.getState();
        const catalogMap = new Map(products.map((p) => [p.id, p]));

        const updatedInstances = state.furnitureInstances.map((fi) => {
          if (!fi.snappedTo) return fi;
          const wall = state.room!.walls.find((w) => w.id === fi.snappedTo!.wallId);
          if (!wall) return fi;
          if (wall.startPointIndex !== pointIndex && wall.endPointIndex !== pointIndex) return fi;

          const catalogItem = catalogMap.get(fi.catalogItemId);
          if (!catalogItem) return fi;
          const fw = catalogItem.widthCm;
          const fd = catalogItem.depthCm;

          // Old wall geometry
          const oldA = state.room!.points[wall.startPointIndex];
          const oldB = state.room!.points[wall.endPointIndex];
          const oldLen = Math.hypot(oldB.x - oldA.x, oldB.y - oldA.y);
          if (oldLen < 1) return fi;
          const oldUx = (oldB.x - oldA.x) / oldLen;
          const oldUy = (oldB.y - oldA.y) / oldLen;

          // New wall geometry (using updated points)
          const newA = newPoints[wall.startPointIndex];
          const newB = newPoints[wall.endPointIndex];
          const newLen = Math.hypot(newB.x - newA.x, newB.y - newA.y);
          if (newLen < 1) return fi;
          const newUx = (newB.x - newA.x) / newLen;
          const newUy = (newB.y - newA.y) / newLen;

          // New rotation: rotate by the same angle delta as the wall
          const oldWallAngle = Math.atan2(oldUy, oldUx) * (180 / Math.PI);
          const newWallAngle = Math.atan2(newUy, newUx) * (180 / Math.PI);
          const angleDelta   = newWallAngle - oldWallAngle;
          const newRotation  = ((fi.rotation + angleDelta) % 360 + 360) % 360;

          // Compute the snapped face midpoint in WORLD SPACE using old rotation
          const side       = fi.snappedTo!.side;
          const oldOffset  = faceMidpointOffset(side, fw, fd, fi.rotation);
          const oldCenterX = fi.position.x + fw / 2;
          const oldCenterY = fi.position.y + fd / 2;
          const fmX = oldCenterX + oldOffset.x; // face midpoint world x
          const fmY = oldCenterY + oldOffset.y; // face midpoint world y

          // Determine the FIXED (non-dragged) wall endpoint — this is the pivot
          const fixedIsStart = (pointIndex === wall.endPointIndex);
          const fixedPt = fixedIsStart ? oldA : oldB; // stays the same in newPoints too

          // Along-wall direction FROM the fixed endpoint
          // If fixed = start (A): direction is A→B = (oldUx, oldUy)
          // If fixed = end   (B): direction is B→A = (−oldUx, −oldUy)
          const oldFdx = fixedIsStart ?  oldUx : -oldUx;
          const oldFdy = fixedIsStart ?  oldUy : -oldUy;
          const newFdx = fixedIsStart ?  newUx : -newUx;
          const newFdy = fixedIsStart ?  newUy : -newUy;

          // Along-wall distance from the fixed point to the face midpoint
          const tAlong = (fmX - fixedPt.x) * oldFdx + (fmY - fixedPt.y) * oldFdy;

          // New face midpoint: same along-wall distance from fixed point, on the NEW wall
          const newFmX = fixedPt.x + tAlong * newFdx;
          const newFmY = fixedPt.y + tAlong * newFdy;

          // Face midpoint offset at the NEW rotation
          const newOffset  = faceMidpointOffset(side, fw, fd, newRotation);

          // New center = new face midpoint − new face offset
          const newCX = newFmX - newOffset.x;
          const newCY = newFmY - newOffset.y;

          // New top-left position
          const newPos = { x: newCX - fw / 2, y: newCY - fd / 2 };

          return { ...fi, position: newPos, rotation: newRotation };
        });

        set({
          room: { ...state.room, points: newPoints },
          furnitureInstances: updatedInstances,
        });
      },

      setCanvasState: (canvas) =>
        set((s) => ({ canvas: { ...s.canvas, ...canvas } })),

      fitRoomToCanvas: (canvasWidth, canvasHeight) => {
        const { room, canvas } = get();
        if (!room) return;
        const fit = computeFitTransform(room.points, canvasWidth, canvasHeight);
        set({ canvas: { ...canvas, ...fit } });
      },

      resetPlan: () => set(initialState),
    }),
    {
      name: 'frp-plan-state',
      onRehydrateStorage: () => (state) => {
        if (!state || state.version !== 1) {
          return initialState;
        }
      },
    }
  )
);
