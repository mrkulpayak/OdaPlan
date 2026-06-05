import { create } from 'zustand';
import type { ToastItem } from '../types';

type ActiveSection = 'room' | 'doors-windows' | 'furniture' | 'favorites' | 'custom-shapes' | 'add-product' | null;

interface UiState {
  selectedItemId: string | null;
  activeSection: ActiveSection;
  isDrawingMode: boolean;
  toasts: ToastItem[];
  selectedWallIds: string[];
  /** When set, PlannerPage opens AddProductModal pre-filled with this custom shape's data */
  saveCustomShapeId: string | null;
}

interface UiActions {
  setSelectedItemId: (id: string | null) => void;
  setActiveSection: (section: ActiveSection) => void;
  setDrawingMode: (active: boolean) => void;
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
  toggleWallSelection: (id: string, multiSelect: boolean) => void;
  clearWallSelection: () => void;
  setSaveCustomShapeId: (id: string | null) => void;
}

export const useUiStore = create<UiState & UiActions>()((set) => ({
  selectedItemId: null,
  activeSection: 'room',
  isDrawingMode: false,
  toasts: [],
  selectedWallIds: [],
  saveCustomShapeId: null,

  setSelectedItemId: (id) => set({ selectedItemId: id, selectedWallIds: [] }),
  setActiveSection: (section) => set({ activeSection: section }),
  setDrawingMode: (active) => set({ isDrawingMode: active }),

  addToast: (toast) =>
    set((s) => ({
      toasts: [
        ...s.toasts.slice(-2),
        { ...toast, id: crypto.randomUUID() },
      ],
    })),

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  toggleWallSelection: (id, multiSelect) =>
    set((s) => {
      if (multiSelect) {
        const already = s.selectedWallIds.includes(id);
        return {
          selectedItemId: null,
          selectedWallIds: already
            ? s.selectedWallIds.filter((w) => w !== id)
            : [...s.selectedWallIds, id],
        };
      }
      return {
        selectedItemId: null,
        selectedWallIds: s.selectedWallIds[0] === id && s.selectedWallIds.length === 1 ? [] : [id],
      };
    }),

  clearWallSelection: () => set({ selectedWallIds: [] }),
  setSaveCustomShapeId: (id) => set({ saveCustomShapeId: id }),
}));
