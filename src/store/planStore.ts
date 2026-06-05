import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlanState, Room, FurnitureInstance, CanvasState, Point, Door, Window } from '../types';
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
  const walls = points.map((_, i) => ({
    id: makeId(),
    startPointIndex: i,
    endPointIndex: (i + 1) % points.length,
    isLengthLocked: false,
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

        if (wall.isLengthLocked) {
          return { blocked: true, reason: 'This change conflicts with locked dimensions. Unlock the affected wall to apply this change.' };
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
          return {
            room: {
              ...s.room,
              walls: s.room.walls.map((w) =>
                w.id === wallId ? { ...w, isLengthLocked: !w.isLengthLocked } : w
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
          // Replace any existing constraint at this corner
          const filtered = s.room.constraints.filter((c) => c.sharedPointIndex !== sharedPointIndex);
          const constraint = { id: makeId(), type: 'angle' as const, sharedPointIndex, angleDeg };
          return { room: { ...s.room, constraints: [...filtered, constraint] } };
        }),

      removeConstraint: (constraintId) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, constraints: s.room.constraints.filter((c) => c.id !== constraintId) } };
        }),

      moveRoomPoint: (pointIndex, newPosCm) => {
        const state = get();
        if (!state.room) return;

        // Block drag if any connected wall is length-locked
        const connectedWalls = state.room.walls.filter(
          (w) => w.startPointIndex === pointIndex || w.endPointIndex === pointIndex
        );
        if (connectedWalls.some((w) => w.isLengthLocked)) return;

        // Start with desired position
        const newPoints = state.room.points.map((p, i) =>
          i === pointIndex ? newPosCm : p
        );

        // Apply angle constraints.
        // For each constraint, handle TWO cases:
        //   Case A: User is dragging an ARM ENDPOINT (one of the two non-shared points).
        //           → Project the dragged arm onto the direction that maintains the locked angle.
        //   Case B: User is dragging the SHARED CORNER itself.
        //           → Rigid body: translate both arm endpoints by the same delta.
        for (const c of state.room.constraints) {
          const sharedIdx: number = c.sharedPointIndex;
          const connectedWalls: typeof state.room.walls = state.room.walls.filter(
            (w) => w.startPointIndex === sharedIdx || w.endPointIndex === sharedIdx
          );
          if (connectedWalls.length < 2) continue;

          const wallA: (typeof connectedWalls)[number] = connectedWalls[0];
          const wallB: (typeof connectedWalls)[number] = connectedWalls[1];
          const arm1Idx = wallA.startPointIndex === sharedIdx ? wallA.endPointIndex : wallA.startPointIndex;
          const arm2Idx = wallB.startPointIndex === sharedIdx ? wallB.endPointIndex : wallB.startPointIndex;

          const angleDeg = c.angleDeg ?? 90;
          const angleRad = (angleDeg * Math.PI) / 180;

          if (pointIndex === sharedIdx) {
            // ── Case B: shared corner drag → rigid body translate ──────────
            const dX = newPoints[sharedIdx].x - state.room.points[sharedIdx].x;
            const dY = newPoints[sharedIdx].y - state.room.points[sharedIdx].y;
            newPoints[arm1Idx] = {
              x: state.room.points[arm1Idx].x + dX,
              y: state.room.points[arm1Idx].y + dY,
            };
            newPoints[arm2Idx] = {
              x: state.room.points[arm2Idx].x + dX,
              y: state.room.points[arm2Idx].y + dY,
            };
          } else if (pointIndex === arm1Idx || pointIndex === arm2Idx) {
            // ── Case A: arm endpoint drag → project onto locked angle direction ──
            const sharedPt = state.room.points[sharedIdx];

            // The "fixed" arm is the other one (not being dragged)
            const fixedArmIdx = pointIndex === arm1Idx ? arm2Idx : arm1Idx;
            const fixedArmPt  = state.room.points[fixedArmIdx];
            const fDx = fixedArmPt.x - sharedPt.x;
            const fDy = fixedArmPt.y - sharedPt.y;
            const fLen = Math.hypot(fDx, fDy);
            if (fLen < 1) continue;
            const fixedUx = fDx / fLen;
            const fixedUy = fDy / fLen;

            // Current direction of the arm being dragged (to choose the right ±angle side)
            const movingPt = state.room.points[pointIndex];
            const movingCurDx = movingPt.x - sharedPt.x;
            const movingCurDy = movingPt.y - sharedPt.y;

            // Two candidate directions at ±angleDeg from fixed arm
            const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
            const d1x = fixedUx * cos - fixedUy * sin;
            const d1y = fixedUx * sin + fixedUy * cos;
            const d2x = fixedUx * cos + fixedUy * sin;
            const d2y = -fixedUx * sin + fixedUy * cos;

            // Pick the candidate closest to the wall's current direction
            const dot1 = d1x * movingCurDx + d1y * movingCurDy;
            const dot2 = d2x * movingCurDx + d2y * movingCurDy;
            const targetDirX = dot1 >= dot2 ? d1x : d2x;
            const targetDirY = dot1 >= dot2 ? d1y : d2y;

            // Project the desired new position onto this direction from the shared corner
            const toNew = { x: newPosCm.x - sharedPt.x, y: newPosCm.y - sharedPt.y };
            const t = Math.max(50, toNew.x * targetDirX + toNew.y * targetDirY);
            newPoints[pointIndex] = { x: sharedPt.x + t * targetDirX, y: sharedPt.y + t * targetDirY };
          }
          // If neither arm nor shared → this constraint doesn't affect this drag, skip.
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
