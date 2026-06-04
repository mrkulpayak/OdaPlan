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
  addAngleConstraint: (wallAId: string, wallBId: string) => void;
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

      addAngleConstraint: (wallAId, wallBId) =>
        set((s) => {
          if (!s.room) return s;
          // Don't duplicate
          const exists = s.room.constraints.some(
            (c) => (c.wallAId === wallAId && c.wallBId === wallBId) || (c.wallAId === wallBId && c.wallBId === wallAId)
          );
          if (exists) return s;
          const constraint = { id: makeId(), type: '90deg' as const, wallAId, wallBId };
          return { room: { ...s.room, constraints: [...s.room.constraints, constraint] } };
        }),

      removeConstraint: (constraintId) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, constraints: s.room.constraints.filter((c) => c.id !== constraintId) } };
        }),

      moveRoomPoint: (pointIndex, newPosCm) => {
        const state = get();
        if (!state.room) return;

        // Block drag if any connected wall is locked
        const connectedWalls = state.room.walls.filter(
          (w) => w.startPointIndex === pointIndex || w.endPointIndex === pointIndex
        );
        if (connectedWalls.some((w) => w.isLengthLocked)) return;

        const newPoints = state.room.points.map((p, i) =>
          i === pointIndex ? newPosCm : p
        );

        // Check 90° constraints: verify angle between constrained walls didn't change > threshold
        for (const c of state.room.constraints) {
          const wallA = state.room.walls.find((w) => w.id === c.wallAId);
          const wallB = state.room.walls.find((w) => w.id === c.wallBId);
          if (!wallA || !wallB) continue;
          const aStart = newPoints[wallA.startPointIndex];
          const aEnd = newPoints[wallA.endPointIndex];
          const bStart = newPoints[wallB.startPointIndex];
          const bEnd = newPoints[wallB.endPointIndex];
          const axLen = Math.hypot(aEnd.x - aStart.x, aEnd.y - aStart.y);
          const bxLen = Math.hypot(bEnd.x - bStart.x, bEnd.y - bStart.y);
          if (axLen === 0 || bxLen === 0) continue;
          const dot =
            ((aEnd.x - aStart.x) * (bEnd.x - bStart.x) + (aEnd.y - aStart.y) * (bEnd.y - bStart.y)) /
            (axLen * bxLen);
          const angleDeg = Math.abs((Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI);
          // Allow up to 5° deviation from 90°
          if (Math.abs(angleDeg - 90) > 5) return;
        }

        set({ room: { ...state.room, points: newPoints } });
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
