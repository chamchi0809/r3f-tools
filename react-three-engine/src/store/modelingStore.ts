import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditorMode = "object" | "modeling" | "brush";
export type SelectionMode = "vertex" | "edge" | "face";
export type ModelingTransformMode = "translate" | "rotate" | "scale";
export type BrushType = "polygon" | "poly3d" | "cube" | "slope";

/** A selected sub-element index within the active mesh's BufferGeometry. */
export interface SelectedElement {
  /** "vertex" index, "edge" as [a, b] packed into a string key, "face" as face index */
  type: SelectionMode;
  /** For vertex: vertex index. For edge: lower vertex index. For face: triangle index. */
  index: number;
  /** For edge: second vertex index. */
  index2?: number;
}

interface ModelingState {
  editorMode: EditorMode;
  selectionMode: SelectionMode;
  transformMode: ModelingTransformMode;
  brushType: BrushType;
  /** 1 = drawing polygon, 2 = extruding (poly3D only) */
  brushPhase: 1 | 2;
  /** Number of polygon vertices placed so far in brush phase 1 */
  brushPointCount: number;
  /** Indices of selected sub-elements in the active mesh geometry */
  selectedElements: SelectedElement[];

  setEditorMode: (mode: EditorMode) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  setTransformMode: (mode: ModelingTransformMode) => void;
  setBrushType: (type: BrushType) => void;
  setBrushPhase: (phase: 1 | 2) => void;
  setBrushPointCount: (count: number) => void;
  selectElement: (el: SelectedElement, additive: boolean) => void;
  clearSelection: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useModelingStore = create<ModelingState>((set) => ({
  editorMode: "object",
  selectionMode: "vertex",
  transformMode: "translate",
  brushType: "polygon",
  brushPhase: 1,
  brushPointCount: 0,
  selectedElements: [],

  setEditorMode: (mode) =>
    set({ editorMode: mode, selectedElements: [] }),

  setSelectionMode: (mode) =>
    set({ selectionMode: mode, selectedElements: [] }),

  setTransformMode: (mode) =>
    set({ transformMode: mode }),

  setBrushType: (type) =>
    set({ brushType: type, brushPhase: 1, brushPointCount: 0 }),

  setBrushPhase: (phase) =>
    set({ brushPhase: phase }),

  setBrushPointCount: (count) =>
    set({ brushPointCount: count }),

  selectElement: (el, additive) =>
    set((s) => {
      const key = (e: SelectedElement) => `${e.type}:${e.index}:${e.index2 ?? ""}`;
      const elKey = key(el);
      if (additive) {
        const already = s.selectedElements.some((e) => key(e) === elKey);
        return {
          selectedElements: already
            ? s.selectedElements.filter((e) => key(e) !== elKey)
            : [...s.selectedElements, el],
        };
      }
      return { selectedElements: [el] };
    }),

  clearSelection: () => set({ selectedElements: [] }),
}));

// ─── Actions (stable refs) ────────────────────────────────────────────────────

export const modelingActions = {
  setEditorMode: (mode: EditorMode) => useModelingStore.getState().setEditorMode(mode),
  setSelectionMode: (mode: SelectionMode) => useModelingStore.getState().setSelectionMode(mode),
  setTransformMode: (mode: ModelingTransformMode) => useModelingStore.getState().setTransformMode(mode),
  setBrushType: (type: BrushType) => useModelingStore.getState().setBrushType(type),
  setBrushPhase: (phase: 1 | 2) => useModelingStore.getState().setBrushPhase(phase),
  setBrushPointCount: (count: number) => useModelingStore.getState().setBrushPointCount(count),
  selectElement: (el: SelectedElement, additive = false) => useModelingStore.getState().selectElement(el, additive),
  clearSelection: () => useModelingStore.getState().clearSelection(),
};
