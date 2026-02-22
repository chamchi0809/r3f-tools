import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';

/**
 * Selection store state interface
 */
interface SelectionStoreState {
  /**
   * Currently selected entity ID (null if nothing selected)
   */
  selectedId: string | null;

  /**
   * Set the selected entity ID
   */
  setSelectedId: (id: string | null) => void;

  /**
   * Clear selection
   */
  clearSelection: () => void;

  /**
   * Check if an entity is selected
   */
  isSelected: (id: string) => boolean;
}

/**
 * Selection store - manages entity selection state
 * Uses Zustand for minimal, serializable state management
 */
export const useSelectionStore: UseBoundStore<StoreApi<SelectionStoreState>> = create<SelectionStoreState>((set, get) => ({
  selectedId: null,

  setSelectedId: (id) => set({ selectedId: id }),

  clearSelection: () => set({ selectedId: null }),

  isSelected: (id) => get().selectedId === id,
}));
