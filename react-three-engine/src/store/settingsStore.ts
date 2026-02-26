import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import * as THREE from "three";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A field key in the format "ClassName.propKey" (e.g. "MeshStandardMaterial.roughness")
 * or bare "propKey" for cross-class hiding.
 *
 * Lookup priority (mirrors InspectorPane fieldRegistry):
 *   "ClassName.propKey" > "propKey"
 */
export type FieldKey = string;
THREE.PointLight;
// ─── Defaults ─────────────────────────────────────────────────────────────────
/**
 * Fields hidden by default. These are generally noisy / rarely-needed properties
 * that clutter the inspector for everyday editing.
 *
 * Edit this list to change what the "Reset to defaults" button restores.
 * Format: "ClassName.propKey" or bare "propKey" (applies across all classes).
 */
export const DEFAULT_HIDDEN_FIELDS: FieldKey[] = [
  // Object3D internals
  "Object3D.uuid",
  "Object3D.id",
  "Object3D.parent",
  "Object3D.children",
  "Object3D.layers",
  "Object3D.matrixWorld",
  "Object3D.matrixWorldNeedsUpdate",
  "Object3D.matrixAutoUpdate",
  "Object3D.renderOrder",
  // Mesh internals
  "Mesh.matrixAutoUpdate",
  "Mesh.matrixWorldAutoUpdate",
  "Mesh.matrixWorldNeedsUpdate",
  "Mesh.renderOrder",
  "Mesh.frustumCulled",
  // PointLight internals
  "PointLight.frustumCulled",
  "PointLight.matrixAutoUpdate",
  "PointLight.matrixWorldAutoUpdate",
  "PointLight.matrixWorldNeedsUpdate",
  "PointLight.renderOrder",
  "PointLight.receiveShadow",
  // Geometry internals
  "BufferGeometry.uuid",
  "BufferGeometry.id",

  // Material internals
  "Material.uuid",
  "Material.id",
  "Material.depthFunc",
  "Material.depthWrite",
  "Material.depthTest",
  "Material.displacementBias",
  "Material.displacementScale",

  // MeshStandardMaterial internals
  "MeshStandardMaterial.colorWrite",
  "MeshStandardMaterial.depthFunc",
  "MeshStandardMaterial.depthWrite",
  "MeshStandardMaterial.depthTest",
  "MeshStandardMaterial.displacementBias",
  "MeshStandardMaterial.displacementScale",
  "MeshStandardMaterial.allowOverride",
  "MeshStandardMaterial.alphaToHash",
  "MeshStandardMaterial.alphaToCoverage",
  "MeshStandardMaterial.name",
  "MeshStandardMaterial.forceSinglePass",
  "MeshStandardMaterial.polygonOffset",
  "MeshStandardMaterial.polygonOffsetFactor",
  "MeshStandardMaterial.polygonOffsetUnits",
  "MeshStandardMaterial.stencilFail",
  "MeshStandardMaterial.stencilFunc",
  "MeshStandardMaterial.stencilFuncMask",
  "MeshStandardMaterial.stencilRef",
  "MeshStandardMaterial.stencilWrite",
  "MeshStandardMaterial.stencilWriteMask",
  "MeshStandardMaterial.stencilZFail",
  "MeshStandardMaterial.stencilZPass",
  "MeshStandardMaterial.version",
  "MeshStandardMaterial.vertexColors",
  "MeshStandardMaterial.visible",
];

// ─── State ────────────────────────────────────────────────────────────────────

interface SettingsState {
  /**
   * Set of field keys whose fields are hidden in the inspector.
   * Format: "ClassName.propKey" or "propKey".
   */
  hiddenFields: Set<FieldKey>;

  /**
   * When true, all SKIP_KEYS filters and hiddenFields are bypassed.
   * Shows every introspectable property on the selected object.
   */
  debugMode: boolean;

  // ─── actions ──────────────────────────────────────────────────────────────

  setDebugMode: (enabled: boolean) => void;
  toggleDebugMode: () => void;

  /** Hide a specific field. */
  hideField: (key: FieldKey) => void;
  /** Show a previously hidden field. */
  showField: (key: FieldKey) => void;
  /** Toggle visibility of a field. */
  toggleField: (key: FieldKey) => void;
  /** Reset hidden fields to DEFAULT_HIDDEN_FIELDS. */
  resetHiddenFields: () => void;
}

// ─── Serialization helpers ────────────────────────────────────────────────────

/** Shape stored in localStorage (JSON-safe). */
interface PersistedSettings {
  hiddenFields: FieldKey[];
  debugMode: boolean;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      hiddenFields: new Set(DEFAULT_HIDDEN_FIELDS),
      debugMode: false,

      setDebugMode: (enabled) => set({ debugMode: enabled }),
      toggleDebugMode: () => set((s) => ({ debugMode: !s.debugMode })),

      hideField: (key) =>
        set((s) => {
          const next = new Set(s.hiddenFields);
          next.add(key);
          return { hiddenFields: next };
        }),

      showField: (key) =>
        set((s) => {
          const next = new Set(s.hiddenFields);
          next.delete(key);
          return { hiddenFields: next };
        }),

      toggleField: (key) => {
        const { hiddenFields, hideField, showField } = get();
        if (hiddenFields.has(key)) {
          showField(key);
        } else {
          hideField(key);
        }
      },

      resetHiddenFields: () =>
        set({ hiddenFields: new Set(DEFAULT_HIDDEN_FIELDS) }),
    }),
    {
      name: "react-three-engine:settings",
      storage: createJSONStorage(() => localStorage),
      // Only persist data — not action functions.
      partialize: (state): PersistedSettings => ({
        hiddenFields: [...state.hiddenFields],
        debugMode: state.debugMode,
      }),
      // Rehydrate: convert the JSON array back to a Set.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as object),
        hiddenFields: new Set(
          (persisted as Partial<PersistedSettings>).hiddenFields ??
            DEFAULT_HIDDEN_FIELDS,
        ),
      }),
    },
  ),
);

// ─── Actions (stable references for use outside React) ───────────────────────

export const settingsActions: {
  setDebugMode: (enabled: boolean) => void;
  toggleDebugMode: () => void;
  hideField: (key: FieldKey) => void;
  showField: (key: FieldKey) => void;
  toggleField: (key: FieldKey) => void;
  resetHiddenFields: () => void;
  isFieldVisible: (className: string, propKey: string) => boolean;
} = {
  setDebugMode: (enabled) => useSettingsStore.getState().setDebugMode(enabled),
  toggleDebugMode: () => useSettingsStore.getState().toggleDebugMode(),
  hideField: (key) => useSettingsStore.getState().hideField(key),
  showField: (key) => useSettingsStore.getState().showField(key),
  toggleField: (key) => useSettingsStore.getState().toggleField(key),
  resetHiddenFields: () => useSettingsStore.getState().resetHiddenFields(),
  isFieldVisible: (className, propKey) => {
    const { debugMode, hiddenFields } = useSettingsStore.getState();
    if (debugMode) return true;
    if (hiddenFields.has(`${className}.${propKey}`)) return false;
    if (hiddenFields.has(propKey)) return false;
    return true;
  },
};
