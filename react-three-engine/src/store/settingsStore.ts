import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import * as THREE from "three";
import { DEFAULT_HIDDEN_FIELDS } from "../constants/defaultHiddenFields";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A field key in the format "ClassName.propKey" (e.g. "MeshStandardMaterial.roughness")
 * or bare "propKey" for cross-class hiding.
 *
 * Lookup priority (mirrors InspectorPane fieldRegistry):
 *   "ClassName.propKey" > "propKey"
 */
export type FieldKey = string;

// ─── Snap Settings ────────────────────────────────────────────────────────────

export interface SnapSettings {
  /** Master toggle: Ctrl key enables snapping when true */
  enabled: boolean;
  /** Translation snap step in world units (e.g. 1.0) */
  translateStep: number;
  /** Rotation snap step in degrees (e.g. 15). Stored as degrees, converted to radians when passed to TransformControls. */
  rotateDeg: number;
  /** Scale snap step (e.g. 0.1 = 10% increments) */
  scaleStep: number;
  /** Brush vertex placement snap step in world units */
  brushStep: number;
}

export const DEFAULT_SNAP: SnapSettings = {
  enabled: true,
  translateStep: 1.0,
  rotateDeg: 15,
  scaleStep: 0.25,
  brushStep: 0.5,
};

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

  /** Snap configuration. Ctrl activates snapping when enabled=true. */
  snap: SnapSettings;

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

  /** Update any subset of snap settings. */
  setSnap: (patch: Partial<SnapSettings>) => void;
  /** Reset snap settings to defaults. */
  resetSnap: () => void;
}

// ─── Serialization helpers ────────────────────────────────────────────────────

/** Shape stored in localStorage (JSON-safe). */
interface PersistedSettings {
  hiddenFields: FieldKey[];
  debugMode: boolean;
  snap: SnapSettings;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      hiddenFields: new Set(DEFAULT_HIDDEN_FIELDS),
      debugMode: false,
      snap: { ...DEFAULT_SNAP },

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

      setSnap: (patch) =>
        set((s) => ({ snap: { ...s.snap, ...patch } })),

      resetSnap: () =>
        set({ snap: { ...DEFAULT_SNAP } }),
    }),
    {
      name: "react-three-engine:settings",
      storage: createJSONStorage(() => localStorage),
      // Only persist data — not action functions.
      partialize: (state): PersistedSettings => ({
        hiddenFields: [...state.hiddenFields],
        debugMode: state.debugMode,
        snap: state.snap,
      }),
      // Rehydrate: convert the JSON array back to a Set.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as object),
        hiddenFields: new Set(
          (persisted as Partial<PersistedSettings>).hiddenFields ??
            DEFAULT_HIDDEN_FIELDS,
        ),
        snap: {
          ...DEFAULT_SNAP,
          ...((persisted as Partial<PersistedSettings>).snap ?? {}),
        },
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
  setSnap: (patch: Partial<SnapSettings>) => void;
  resetSnap: () => void;
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
  setSnap: (patch) => useSettingsStore.getState().setSnap(patch),
  resetSnap: () => useSettingsStore.getState().resetSnap(),
};

// ─── Derived snap helpers ─────────────────────────────────────────────────────

/** Returns the active TransformControls snap values given Ctrl key state. */
export function resolveSnapProps(snap: SnapSettings, ctrlHeld: boolean): {
  translationSnap: number | null;
  rotationSnap: number | null;
  scaleSnap: number | null;
} {
  if (!snap.enabled || !ctrlHeld) {
    return { translationSnap: null, rotationSnap: null, scaleSnap: null };
  }
  return {
    translationSnap: snap.translateStep,
    rotationSnap: (snap.rotateDeg * Math.PI) / 180,
    scaleSnap: snap.scaleStep,
  };
}

/** Snap a world-space value to grid. */
export function snapToGrid(value: number, step: number): number {
  return Math.round(value / step) * step;
}

void THREE; // keep import for any future THREE-typed defaults
