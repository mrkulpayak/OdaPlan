import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlanState, Room, FurnitureInstance, CanvasState, Point, Door, Window } from '../types';
import { segmentLength, segmentAngleDegrees, cmToPx } from '../lib/geometry';

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
  addAngleConstraint: (wallAId: string, wallBId: string, angleDeg: number) => void;
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

      addAngleConstraint: (wallAId, wallBId, angleDeg) =>
        set((s) => {
          if (!s.room) return s;
          // Remove existing constraint between these walls (replace with new angle)
          const filtered = s.room.constraints.filter(
            (c) => !((c.wallAId === wallAId && c.wallBId === wallBId) || (c.wallAId === wallBId && c.wallBId === wallAId))
          );
          const constraint = { id: makeId(), type: 'angle' as const, wallAId, wallBId, angleDeg };
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

        // Apply angle constraints: project the dragged point onto the direction that
        // maintains the locked angle between the two walls meeting at the shared corner.
        for (const c of state.room.constraints) {
          const wallA = state.room.walls.find((w) => w.id === c.wallAId);
          const wallB = state.room.walls.find((w) => w.id === c.wallBId);
          if (!wallA || !wallB) continue;

          // Find shared corner index
          const aEnds = [wallA.startPointIndex, wallA.endPointIndex];
          const bEnds = [wallB.startPointIndex, wallB.endPointIndex];
          const sharedIdx = aEnds.find((i) => bEnds.includes(i));
          if (sharedIdx === undefined) continue;

          const aOtherIdx = sharedIdx === wallA.startPointIndex ? wallA.endPointIndex : wallA.startPointIndex;
          const bOtherIdx = sharedIdx === wallB.startPointIndex ? wallB.endPointIndex : wallB.startPointIndex;

          const isEndOfA = pointIndex === aOtherIdx;
          const isEndOfB = pointIndex === bOtherIdx;
          if (!isEndOfA && !isEndOfB) continue;

          const sharedPt = state.room.points[sharedIdx];
          // Support legacy constraints that may lack angleDeg
          const angleDeg = c.angleDeg ?? 90;
          const angleRad = (angleDeg * Math.PI) / 180;

          // Determine: fixed wall direction (the wall NOT being dragged)
          // and current direction of the wall being dragged (to pick the right ±angle candidate)
          let fixedUx: number, fixedUy: number;
          let movingCurDx: number, movingCurDy: number;

          if (isEndOfA) {
            const bOtherPt = state.room.points[bOtherIdx];
            const bDx = bOtherPt.x - sharedPt.x;
            const bDy = bOtherPt.y - sharedPt.y;
            const bLen = Math.hypot(bDx, bDy);
            if (bLen < 1) continue;
            fixedUx = bDx / bLen; fixedUy = bDy / bLen;
            const aPt = state.room.points[aOtherIdx];
            movingCurDx = aPt.x - sharedPt.x;
            movingCurDy = aPt.y - sharedPt.y;
          } else {
            const aOtherPt = state.room.points[aOtherIdx];
            const aDx = aOtherPt.x - sharedPt.x;
            const aDy = aOtherPt.y - sharedPt.y;
            const aLen = Math.hypot(aDx, aDy);
            if (aLen < 1) continue;
            fixedUx = aDx / aLen; fixedUy = aDy / aLen;
            const bPt = state.room.points[bOtherIdx];
            movingCurDx = bPt.x - sharedPt.x;
            movingCurDy = bPt.y - sharedPt.y;
          }

          // Two candidate directions at ±angleDeg from fixed wall
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

        // --- Move wall-snapped furniture with the wall ---
        // For each furniture instance snapped to a wall that has the moved point as an endpoint,
        // recompute the furniture position to maintain its relative position along the wall.
        const updatedInstances = state.furnitureInstances.map((fi) => {
          if (!fi.snappedTo) return fi;
          const wall = state.room!.walls.find((w) => w.id === fi.snappedTo!.wallId);
          if (!wall) return fi;
          if (wall.startPointIndex !== pointIndex && wall.endPointIndex !== pointIndex) return fi;

          // Old wall geometry
          const oldA = state.room!.points[wall.startPointIndex];
          const oldB = state.room!.points[wall.endPointIndex];
          const oldLen = Math.hypot(oldB.x - oldA.x, oldB.y - oldA.y);
          if (oldLen < 1) return fi;
          const oldUx = (oldB.x - oldA.x) / oldLen;
          const oldUy = (oldB.y - oldA.y) / oldLen;

          // Decompose furniture top-left position into components along and perpendicular to old wall
          const toPos = { x: fi.position.x - oldA.x, y: fi.position.y - oldA.y };
          const tAlong = toPos.x * oldUx + toPos.y * oldUy;   // longitudinal (along wall)
          const tPerp = toPos.x * (-oldUy) + toPos.y * oldUx; // perpendicular to wall

          // New wall geometry (using updated points)
          const newA = newPoints[wall.startPointIndex];
          const newB = newPoints[wall.endPointIndex];
          const newLen = Math.hypot(newB.x - newA.x, newB.y - newA.y);
          if (newLen < 1) return fi;
          const newUx = (newB.x - newA.x) / newLen;
          const newUy = (newB.y - newA.y) / newLen;

          // Recompose: maintain same along-wall and perpendicular distances
          const newPos = {
            x: newA.x + tAlong * newUx + tPerp * (-newUy),
            y: newA.y + tAlong * newUy + tPerp * newUx,
          };

          // Also rotate furniture to match the new wall angle
          const oldWallAngleDeg = Math.atan2(oldUy, oldUx) * (180 / Math.PI);
          const newWallAngleDeg = Math.atan2(newUy, newUx) * (180 / Math.PI);
          const angleDelta = newWallAngleDeg - oldWallAngleDeg;
          const newRotation = ((fi.rotation + angleDelta) % 360 + 360) % 360;

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
