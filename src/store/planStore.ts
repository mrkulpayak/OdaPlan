import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlanState, Room, Wall, FurnitureInstance, CanvasState, Point, Door, Window, Column, CustomShapeInstance } from '../types';
import { segmentLength, segmentAngleDegrees, cmToPx, faceMidpointOffset } from '../lib/geometry';
import { useCatalogStore } from './catalogStore';

type HistorySnapshot = {
  room: Room | null;
  furnitureInstances: FurnitureInstance[];
  customShapeInstances: CustomShapeInstance[];
};

const MAX_HISTORY = 10;

interface PlanActions {
  setRoom: (room: Room | null) => void;
  createRoomFromTemplate: (type: RoomTemplate) => void;
  updateWallLength: (wallId: string, newLengthCm: number, canvasWidth: number, canvasHeight: number) => { blocked: boolean; reason?: string };
  toggleWallLock: (wallId: string) => void;
  addFurnitureInstance: (instance: FurnitureInstance) => void;
  addFurnitureInstances: (instances: FurnitureInstance[]) => void;
  replaceModelSet: (removeIds: string[], newInstances: FurnitureInstance[]) => void;
  updateFurnitureInstance: (id: string, updates: Partial<FurnitureInstance>) => void;
  removeFurnitureInstance: (id: string) => void;
  rotateFurniture: (id: string) => void;
  rotateFurnitureToAngle: (id: string, angleDeg: number) => void;
  duplicateFurnitureInstance: (id: string) => void;
  addDoor: (door: Door) => void;
  updateDoor: (id: string, updates: Partial<Door>) => void;
  removeDoor: (id: string) => void;
  addWindow: (window: Window) => void;
  updateWindow: (id: string, updates: Partial<Window>) => void;
  removeWindow: (id: string) => void;
  addColumn: (column: Column) => void;
  updateColumn: (id: string, updates: Partial<Column>) => void;
  removeColumn: (id: string) => void;
  createRoomFromPoints: (points: Point[]) => void;
  addAngleConstraint: (sharedPointIndex: number, angleDeg: number) => void;
  removeConstraint: (constraintId: string) => void;
  toggleWallPin: (wallId: string) => void;
  translateWall: (wallId: string, delta: Point) => void;
  snapWallStraight: (wallId: string, direction: 'horizontal' | 'vertical') => void;
  snapAllWallsStraight: () => void;
  moveRoomPoint: (pointIndex: number, newPosCm: Point) => void;
  setCanvasState: (canvas: Partial<CanvasState>) => void;
  fitRoomToCanvas: (canvasWidth: number, canvasHeight: number) => void;
  resetPlan: () => void;
  // Custom shapes
  addCustomShapeInstance: (instance: CustomShapeInstance) => void;
  updateCustomShapeInstance: (id: string, updates: Partial<CustomShapeInstance>) => void;
  removeCustomShapeInstance: (id: string) => void;
  rotateCustomShape: (id: string) => void;
  duplicateCustomShapeInstance: (id: string) => void;
  // Undo / Redo
  saveSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // History stacks (not persisted)
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
}

export type RoomTemplate = 'rectangle' | 'square' | 'l-shape' | 'niche' | 'column' | 'angled';

const defaultCanvas: CanvasState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  viewRotation: 0,
  showDimensionsOnExport: true,
  furnitureColor: '#f5f0e8',
  floorColor: '#e8dcc8',   // açık parke
  showGrid: true,
  snapEnabled: true,
  wallsLocked: false,
};

const initialState: PlanState = {
  version: 1,
  room: null,
  furnitureInstances: [],
  customShapeInstances: [],
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
  return { points, walls, doors: [], windows: [], constraints: [], columns: [] };
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

/** True when every wall in the room is axis-aligned (horizontal or vertical). */
function isOrthogonalRoom(points: Point[], walls: Wall[]): boolean {
  const TOL = 2; // degrees
  return walls.every((w) => {
    const a = points[w.startPointIndex];
    const b = points[w.endPointIndex];
    const angRad = Math.atan2(b.y - a.y, b.x - a.x);
    const angDeg = Math.abs((angRad * 180) / Math.PI) % 180;
    return angDeg < TOL || Math.abs(angDeg - 90) < TOL || Math.abs(angDeg - 180) < TOL;
  });
}

/**
 * Starting from `startIdx`, traverse walls that are perpendicular to the
 * movement axis and collect all endpoint indices that should move together.
 *
 * moveAxis: 'x' → wall being changed is horizontal, propagate via vertical walls
 *           'y' → wall being changed is vertical,   propagate via horizontal walls
 */
function collectOrthogonalFollowers(
  startIdx: number,
  moveAxis: 'x' | 'y',
  points: Point[],
  walls: Wall[],
  excludeWallId: string,
): Set<number> {
  const visited = new Set<number>([startIdx]);
  const queue = [startIdx];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    const connected = walls.filter(
      (w) => w.id !== excludeWallId &&
        (w.startPointIndex === idx || w.endPointIndex === idx),
    );
    for (const w of connected) {
      const a = points[w.startPointIndex];
      const b = points[w.endPointIndex];
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      const wallIsHorizontal = dx >= dy;
      // Traverse walls perpendicular to the movement axis
      const isPerpendicular = moveAxis === 'x' ? !wallIsHorizontal : wallIsHorizontal;
      if (!isPerpendicular) continue;
      const farIdx = w.startPointIndex === idx ? w.endPointIndex : w.startPointIndex;
      if (!visited.has(farIdx)) {
        visited.add(farIdx);
        queue.push(farIdx);
      }
    }
  }
  return visited;
}

export const usePlanStore = create<PlanState & PlanActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ── History (not persisted) ───────────────────────────────────────────
      undoStack: [] as HistorySnapshot[],
      redoStack: [] as HistorySnapshot[],
      canUndo: false,
      canRedo: false,

      saveSnapshot: () => {
        const { room, furnitureInstances, customShapeInstances, undoStack } = get();
        const snapshot: HistorySnapshot = {
          room: room ? JSON.parse(JSON.stringify(room)) : null,
          furnitureInstances: JSON.parse(JSON.stringify(furnitureInstances)),
          customShapeInstances: JSON.parse(JSON.stringify(customShapeInstances)),
        };
        const newStack = [...undoStack, snapshot];
        if (newStack.length > MAX_HISTORY) newStack.shift();
        set({ undoStack: newStack, redoStack: [], canUndo: true, canRedo: false });
      },

      undo: () => {
        const { undoStack, redoStack, room, furnitureInstances, customShapeInstances } = get();
        if (undoStack.length === 0) return;
        const current: HistorySnapshot = {
          room: room ? JSON.parse(JSON.stringify(room)) : null,
          furnitureInstances: JSON.parse(JSON.stringify(furnitureInstances)),
          customShapeInstances: JSON.parse(JSON.stringify(customShapeInstances)),
        };
        const newRedoStack = [...redoStack, current];
        if (newRedoStack.length > MAX_HISTORY) newRedoStack.shift();
        const newUndoStack = [...undoStack];
        const prev = newUndoStack.pop()!;
        set({
          room: prev.room,
          furnitureInstances: prev.furnitureInstances,
          customShapeInstances: prev.customShapeInstances,
          undoStack: newUndoStack,
          redoStack: newRedoStack,
          canUndo: newUndoStack.length > 0,
          canRedo: true,
        });
      },

      redo: () => {
        const { undoStack, redoStack, room, furnitureInstances, customShapeInstances } = get();
        if (redoStack.length === 0) return;
        const current: HistorySnapshot = {
          room: room ? JSON.parse(JSON.stringify(room)) : null,
          furnitureInstances: JSON.parse(JSON.stringify(furnitureInstances)),
          customShapeInstances: JSON.parse(JSON.stringify(customShapeInstances)),
        };
        const newUndoStack = [...undoStack, current];
        if (newUndoStack.length > MAX_HISTORY) newUndoStack.shift();
        const newRedoStack = [...redoStack];
        const next = newRedoStack.pop()!;
        set({
          room: next.room,
          furnitureInstances: next.furnitureInstances,
          customShapeInstances: next.customShapeInstances,
          undoStack: newUndoStack,
          redoStack: newRedoStack,
          canUndo: true,
          canRedo: newRedoStack.length > 0,
        });
      },

      setRoom: (room) => set({ room }),

      createRoomFromTemplate: (type) => {
        get().saveSnapshot();
        const points = templatePoints(type);
        const room = buildRoom(points);
        set((s) => ({
          room,
          furnitureInstances: [],
          customShapeInstances: [],
          canvas: { ...s.canvas, viewRotation: 0 },
        }));
      },

      updateWallLength: (wallId, newLengthCm, canvasWidth, canvasHeight) => {
        get().saveSnapshot();
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
        const newEndX = a.x + newLengthCm * Math.cos(angle);
        const newEndY = a.y + newLengthCm * Math.sin(angle);
        const dx = newEndX - b.x;
        const dy = newEndY - b.y;

        points[wall.endPointIndex] = { x: newEndX, y: newEndY };

        // In a fully orthogonal room, propagate the endpoint shift to all
        // points reachable via perpendicular walls — this keeps opposite
        // parallel walls aligned and prevents diagonal distortion.
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
          const orthogonal = isOrthogonalRoom(state.room.points, state.room.walls);
          if (orthogonal) {
            const moveAxis: 'x' | 'y' = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
            const followers = collectOrthogonalFollowers(
              wall.endPointIndex, moveAxis, state.room.points, state.room.walls, wallId,
            );
            followers.forEach((idx) => {
              if (idx === wall.endPointIndex) return; // already set
              if (moveAxis === 'x') {
                points[idx] = { x: points[idx].x + dx, y: points[idx].y };
              } else {
                points[idx] = { x: points[idx].x, y: points[idx].y + dy };
              }
            });
          }
        }

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

      addFurnitureInstance: (instance) => {
        get().saveSnapshot();
        set((s) => ({ furnitureInstances: [...s.furnitureInstances, instance] }));
      },

      addFurnitureInstances: (instances) => {
        get().saveSnapshot();
        set((s) => ({ furnitureInstances: [...s.furnitureInstances, ...instances] }));
      },

      replaceModelSet: (removeIds, newInstances) => {
        get().saveSnapshot();
        set((s) => ({
          furnitureInstances: [
            ...s.furnitureInstances.filter((fi) => !removeIds.includes(fi.id)),
            ...newInstances,
          ],
        }));
      },

      updateFurnitureInstance: (id, updates) =>
        set((s) => ({
          furnitureInstances: s.furnitureInstances.map((fi) =>
            fi.id === id ? { ...fi, ...updates } : fi
          ),
        })),

      removeFurnitureInstance: (id) => {
        get().saveSnapshot();
        set((s) => ({
          furnitureInstances: s.furnitureInstances.filter((fi) => fi.id !== id),
        }));
      },

      rotateFurniture: (id) => {
        get().saveSnapshot();
        set((s) => ({
          furnitureInstances: s.furnitureInstances.map((fi) => {
            if (fi.id !== id) return fi;
            const newRotation = (fi.rotation + 90) % 360;
            return { ...fi, rotation: newRotation };
          }),
        }));
      },

      rotateFurnitureToAngle: (id, angleDeg) => {
        get().saveSnapshot();
        set((s) => ({
          furnitureInstances: s.furnitureInstances.map((fi) =>
            fi.id === id ? { ...fi, rotation: ((angleDeg % 360) + 360) % 360 } : fi
          ),
        }));
      },

      duplicateFurnitureInstance: (id) => {
        get().saveSnapshot();
        const state = get();
        const instance = state.furnitureInstances.find((fi) => fi.id === id);
        if (!instance) return;
        const copy: FurnitureInstance = {
          ...instance,
          id: makeId(),
          position: { x: instance.position.x + 20, y: instance.position.y + 20 },
        };
        set({ furnitureInstances: [...state.furnitureInstances, copy] });
      },

      addDoor: (door) => {
        get().saveSnapshot();
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, doors: [...s.room.doors, door] } };
        });
      },

      updateDoor: (id, updates) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, doors: s.room.doors.map((d) => d.id === id ? { ...d, ...updates } : d) } };
        }),

      removeDoor: (id) => {
        get().saveSnapshot();
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, doors: s.room.doors.filter((d) => d.id !== id) } };
        });
      },

      addWindow: (window) => {
        get().saveSnapshot();
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, windows: [...s.room.windows, window] } };
        });
      },

      updateWindow: (id, updates) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, windows: s.room.windows.map((w) => w.id === id ? { ...w, ...updates } : w) } };
        }),

      removeWindow: (id) => {
        get().saveSnapshot();
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, windows: s.room.windows.filter((w) => w.id !== id) } };
        });
      },

      addColumn: (column) => {
        get().saveSnapshot();
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, columns: [...(s.room.columns ?? []), column] } };
        });
      },

      updateColumn: (id, updates) =>
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, columns: (s.room.columns ?? []).map((c) => c.id === id ? { ...c, ...updates } : c) } };
        }),

      removeColumn: (id) => {
        get().saveSnapshot();
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, columns: (s.room.columns ?? []).filter((c) => c.id !== id) } };
        });
      },

      createRoomFromPoints: (points) => {
        get().saveSnapshot();
        const room = buildRoom(points);
        set((s) => ({
          room,
          furnitureInstances: [],
          canvas: { ...s.canvas, viewRotation: 0 },
        }));
      },

      addAngleConstraint: (sharedPointIndex, angleDeg) => {
        get().saveSnapshot();
        return set((s) => {
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
        });
      },

      removeConstraint: (constraintId) => {
        get().saveSnapshot();
        set((s) => {
          if (!s.room) return s;
          return { room: { ...s.room, constraints: s.room.constraints.filter((c) => c.id !== constraintId) } };
        });
      },

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

      translateWall: (wallId, delta) => {
        const state = get();
        if (!state.room) return;

        const wall = state.room.walls.find((w) => w.id === wallId);
        if (!wall || wall.isPinned) return;

        const p1Idx = wall.startPointIndex;
        const p2Idx = wall.endPointIndex;

        // Block drag if any adjacent wall (sharing P1 or P2) is pinned
        const pinnedAtP1 = state.room.walls.some(
          (w) => w.id !== wallId && w.isPinned &&
            (w.startPointIndex === p1Idx || w.endPointIndex === p1Idx)
        );
        const pinnedAtP2 = state.room.walls.some(
          (w) => w.id !== wallId && w.isPinned &&
            (w.startPointIndex === p2Idx || w.endPointIndex === p2Idx)
        );
        if (pinnedAtP1 || pinnedAtP2) return;

        const P1 = state.room.points[p1Idx];
        const P2 = state.room.points[p2Idx];

        // Wall normal direction (delta is already perpendicular to wall)
        const wLen = Math.hypot(P2.x - P1.x, P2.y - P1.y);
        if (wLen < 1) return;
        const ux = (P2.x - P1.x) / wLen;
        const uy = (P2.y - P1.y) / wLen;
        const nx = -uy, ny = ux;

        // Scalar perpendicular displacement this increment
        const t = delta.x * nx + delta.y * ny;

        /**
         * New position for a shared endpoint (sharedIdx) that preserves the
         * angle of the connected wall at that corner.
         *
         * Strategy: find the ONE other wall at this point. Slide its far
         * endpoint's ray (Q + r*(cx,cy)) to the position that has a normal
         * displacement of t from the current point. Q stays fixed; only the
         * shared point moves along the connected wall's direction.
         *
         * Derivation:
         *   new_shared = Q + r*(cx,cy)
         *   (new_shared - shared) · n = t
         *   ⟹  (Q-shared)·n + r*(cx*nx+cy*ny) = t
         *   ⟹  r = (t - (Q-shared)·n) / (cx*nx + cy*ny)
         */
        const slideAlongConnected = (sharedIdx: number): Point => {
          const shared = state.room!.points[sharedIdx];
          const connWall = state.room!.walls.find(
            (w) => w.id !== wallId &&
              (w.startPointIndex === sharedIdx || w.endPointIndex === sharedIdx)
          );
          if (!connWall) {
            // Open polygon edge — simple translation fallback
            return { x: shared.x + delta.x, y: shared.y + delta.y };
          }
          const farIdx = connWall.startPointIndex === sharedIdx
            ? connWall.endPointIndex : connWall.startPointIndex;
          const Q = state.room!.points[farIdx];

          const cLen = Math.hypot(shared.x - Q.x, shared.y - Q.y);
          if (cLen < 1) return { x: shared.x + delta.x, y: shared.y + delta.y };

          // Unit vector from Q toward current shared point
          const cx = (shared.x - Q.x) / cLen;
          const cy = (shared.y - Q.y) / cLen;

          const cDotN = cx * nx + cy * ny; // projection of connected-wall dir onto normal
          if (Math.abs(cDotN) < 0.001) {
            // Connected wall runs parallel to dragged wall — can't slide along it
            return { x: shared.x + delta.x, y: shared.y + delta.y };
          }

          const qDotN = (Q.x - shared.x) * nx + (Q.y - shared.y) * ny;
          const r = (t - qDotN) / cDotN;
          return { x: Q.x + r * cx, y: Q.y + r * cy };
        };

        const newP1 = slideAlongConnected(p1Idx);
        const newP2 = slideAlongConnected(p2Idx);

        const newPoints = state.room.points.map((p, i) => {
          if (i === p1Idx) return newP1;
          if (i === p2Idx) return newP2;
          return p;
        });

        // Move wall-snapped furniture and columns by the normal delta
        // (wall angle unchanged, so along-wall positions remain valid)
        const updatedInstances = state.furnitureInstances.map((fi) => {
          if (fi.snappedTo?.wallId !== wallId) return fi;
          return { ...fi, position: { x: fi.position.x + delta.x, y: fi.position.y + delta.y } };
        });

        const updatedColumns = (state.room.columns ?? []).map((col) => {
          if (!col.snappedToWall || col.snappedToWall.wallId !== wallId) return col;
          return { ...col, position: { x: col.position.x + delta.x, y: col.position.y + delta.y } };
        });

        set({
          room: { ...state.room, points: newPoints, columns: updatedColumns },
          furnitureInstances: updatedInstances,
        });
      },

      snapWallStraight: (wallId, direction) => {
        get().saveSnapshot();
        const state = get();
        if (!state.room) return;

        const wall = state.room.walls.find((w) => w.id === wallId);
        if (!wall) return;

        const p1Idx = wall.startPointIndex;
        const p2Idx = wall.endPointIndex;

        /** Far endpoint of the ONE other wall meeting at sharedIdx */
        const getConnFar = (sharedIdx: number): { Q: Point } | null => {
          const connWall = state.room!.walls.find(
            (w) => w.id !== wallId &&
              (w.startPointIndex === sharedIdx || w.endPointIndex === sharedIdx)
          );
          if (!connWall) return null;
          const farIdx = connWall.startPointIndex === sharedIdx
            ? connWall.endPointIndex : connWall.startPointIndex;
          return { Q: state.room!.points[farIdx] };
        };

        /**
         * Interior angle (degrees) at sharedIdx between the dragged wall
         * and the single connected wall.
         */
        const cornerAngleDeg = (sharedIdx: number, otherEndIdx: number): number => {
          const shared = state.room!.points[sharedIdx];
          const otherEnd = state.room!.points[otherEndIdx];
          const far = getConnFar(sharedIdx);
          if (!far) return 90;
          const ax = otherEnd.x - shared.x, ay = otherEnd.y - shared.y;
          const bx = far.Q.x - shared.x,   by = far.Q.y - shared.y;
          const aLen = Math.hypot(ax, ay),  bLen = Math.hypot(bx, by);
          if (aLen < 1 || bLen < 1) return 90;
          const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (aLen * bLen)));
          return Math.acos(dot) * 180 / Math.PI;
        };

        const angle1 = cornerAngleDeg(p1Idx, p2Idx);
        const angle2 = cornerAngleDeg(p2Idx, p1Idx);

        // Pivot = corner whose interior angle is closest to 90°
        const pivotIdx = Math.abs(angle1 - 90) <= Math.abs(angle2 - 90) ? p1Idx : p2Idx;
        const moveIdx  = pivotIdx === p1Idx ? p2Idx : p1Idx;

        const pivot  = state.room.points[pivotIdx];
        const movePt = state.room.points[moveIdx];

        // Connected wall at the moving end: Q stays fixed, movePt slides along (cx,cy)
        const connFar = getConnFar(moveIdx);
        if (!connFar) return;
        const Q = connFar.Q;

        const cLen = Math.hypot(movePt.x - Q.x, movePt.y - Q.y);
        if (cLen < 1) return;
        const cx = (movePt.x - Q.x) / cLen;
        const cy = (movePt.y - Q.y) / cLen;

        let newMovePt: Point;

        if (direction === 'horizontal') {
          if (Math.abs(cy) < 0.001) {
            // Connected wall also horizontal → can't slide along it; shift y directly
            newMovePt = { x: movePt.x, y: pivot.y };
          } else {
            const r = (pivot.y - Q.y) / cy;
            newMovePt = { x: Q.x + r * cx, y: pivot.y };
          }
        } else {
          if (Math.abs(cx) < 0.001) {
            // Connected wall also vertical → can't slide along it; shift x directly
            newMovePt = { x: pivot.x, y: movePt.y };
          } else {
            const r = (pivot.x - Q.x) / cx;
            newMovePt = { x: pivot.x, y: Q.y + r * cy };
          }
        }

        const newPoints = state.room.points.map((p, i) =>
          i === moveIdx ? newMovePt : p
        );

        set({ room: { ...state.room, points: newPoints } });
      },

      snapAllWallsStraight: () => {
        get().saveSnapshot();
        const state = get();
        if (!state.room) return;

        const newPoints = state.room.points.map((p) => ({ ...p }));

        // Build a traversal order: follow startPointIndex → endPointIndex chain
        const wallFrom = new Map<number, typeof state.room.walls[0]>();
        for (const w of state.room.walls) wallFrom.set(w.startPointIndex, w);

        // Find starting point
        const firstWall = state.room.walls[0];
        if (!firstWall) return;

        // For each wall: snap the end point to H or V relative to its start point
        let visited = 0;
        let curWall: typeof firstWall | undefined = firstWall;
        while (curWall && visited < state.room.walls.length) {
          const startPt = newPoints[curWall.startPointIndex];
          const endPt   = newPoints[curWall.endPointIndex];
          const dx = endPt.x - startPt.x;
          const dy = endPt.y - startPt.y;
          if (Math.abs(dx) >= Math.abs(dy)) {
            // Snap to horizontal: fix y of end to start's y
            newPoints[curWall.endPointIndex] = { x: endPt.x, y: startPt.y };
          } else {
            // Snap to vertical: fix x of end to start's x
            newPoints[curWall.endPointIndex] = { x: startPt.x, y: endPt.y };
          }
          curWall = wallFrom.get(curWall.endPointIndex);
          visited++;
        }

        set({ room: { ...state.room, points: newPoints } });
      },

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

        // --- Move wall-snapped columns with the wall (same logic as furniture) ---
        const updatedColumns = (state.room.columns ?? []).map((col) => {
          if (!col.snappedToWall) return col;
          const wall = state.room!.walls.find((w) => w.id === col.snappedToWall!.wallId);
          if (!wall) return col;
          if (wall.startPointIndex !== pointIndex && wall.endPointIndex !== pointIndex) return col;

          const side = col.snappedToWall!.side;

          const oldA = state.room!.points[wall.startPointIndex];
          const oldB = state.room!.points[wall.endPointIndex];
          const oldLen = Math.hypot(oldB.x - oldA.x, oldB.y - oldA.y);
          if (oldLen < 1) return col;
          const oldUx = (oldB.x - oldA.x) / oldLen;
          const oldUy = (oldB.y - oldA.y) / oldLen;

          const newA = newPoints[wall.startPointIndex];
          const newB = newPoints[wall.endPointIndex];
          const newLen = Math.hypot(newB.x - newA.x, newB.y - newA.y);
          if (newLen < 1) return col;
          const newUx = (newB.x - newA.x) / newLen;
          const newUy = (newB.y - newA.y) / newLen;

          // Rotation follows wall angle delta
          const oldWallAngle = Math.atan2(oldUy, oldUx) * (180 / Math.PI);
          const newWallAngle = Math.atan2(newUy, newUx) * (180 / Math.PI);
          const angleDelta  = newWallAngle - oldWallAngle;
          const newRotation = ((col.rotation + angleDelta) % 360 + 360) % 360;

          // Face midpoint of the snapped face in world space (old rotation)
          const colCx = col.position.x + col.widthCm / 2;
          const colCy = col.position.y + col.depthCm / 2;
          const θ = (col.rotation * Math.PI) / 180;
          const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
          let localFx = 0, localFy = 0;
          if (side === 'top')    { localFy = -col.depthCm / 2; }
          if (side === 'bottom') { localFy =  col.depthCm / 2; }
          if (side === 'left')   { localFx = -col.widthCm / 2; }
          if (side === 'right')  { localFx =  col.widthCm / 2; }
          const fmX = colCx + localFx * cosθ - localFy * sinθ;
          const fmY = colCy + localFx * sinθ + localFy * cosθ;

          // Fixed (non-dragged) wall endpoint and directions
          const fixedIsStart = (pointIndex === wall.endPointIndex);
          const fixedPt = fixedIsStart ? oldA : oldB;
          const oldFdx = fixedIsStart ? oldUx : -oldUx;
          const oldFdy = fixedIsStart ? oldUy : -oldUy;
          const newFdx = fixedIsStart ? newUx : -newUx;
          const newFdy = fixedIsStart ? newUy : -newUy;

          // Along-wall distance from fixed point to face midpoint
          const tAlong = (fmX - fixedPt.x) * oldFdx + (fmY - fixedPt.y) * oldFdy;

          // New face midpoint (on new wall)
          const newFmX = fixedPt.x + tAlong * newFdx;
          const newFmY = fixedPt.y + tAlong * newFdy;

          // Face offset at new rotation
          const newθ = (newRotation * Math.PI) / 180;
          const newCosθ = Math.cos(newθ), newSinθ = Math.sin(newθ);
          const newOffX = localFx * newCosθ - localFy * newSinθ;
          const newOffY = localFx * newSinθ + localFy * newCosθ;

          // New column center
          const newCx = newFmX - newOffX;
          const newCy = newFmY - newOffY;

          return {
            ...col,
            position: { x: newCx - col.widthCm / 2, y: newCy - col.depthCm / 2 },
            rotation: newRotation,
          };
        });

        set({
          room: { ...state.room, points: newPoints, columns: updatedColumns },
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

      // ── Custom shapes ─────────────────────────────────────────────────
      addCustomShapeInstance: (instance) => {
        get().saveSnapshot();
        set((s) => ({ customShapeInstances: [...s.customShapeInstances, instance] }));
      },

      updateCustomShapeInstance: (id, updates) =>
        set((s) => ({
          customShapeInstances: s.customShapeInstances.map((cs) =>
            cs.id === id ? { ...cs, ...updates } : cs
          ),
        })),

      removeCustomShapeInstance: (id) => {
        get().saveSnapshot();
        set((s) => ({
          customShapeInstances: s.customShapeInstances.filter((cs) => cs.id !== id),
        }));
      },

      rotateCustomShape: (id) => {
        get().saveSnapshot();
        set((s) => ({
          customShapeInstances: s.customShapeInstances.map((cs) =>
            cs.id === id ? { ...cs, rotation: (cs.rotation + 90) % 360 } : cs
          ),
        }));
      },

      duplicateCustomShapeInstance: (id) => {
        get().saveSnapshot();
        const state = get();
        const instance = state.customShapeInstances.find((cs) => cs.id === id);
        if (!instance) return;
        const copy: CustomShapeInstance = {
          ...instance,
          id: makeId(),
          position: { x: instance.position.x + 20, y: instance.position.y + 20 },
        };
        set({ customShapeInstances: [...state.customShapeInstances, copy] });
      },
    }),
    {
      name: 'frp-plan-state',
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { undoStack, redoStack, canUndo, canRedo, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => (state) => {
        if (!state || state.version !== 1) {
          return initialState;
        }
        // Merge missing canvas fields from defaultCanvas (handles old localStorage)
        if (state.canvas) {
          state.canvas = { ...defaultCanvas, ...state.canvas };
        }
      },
    }
  )
);
