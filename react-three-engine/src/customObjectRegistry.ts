/**
 * Runtime custom object registry.
 *
 * This module loads the plugin-injected virtual module
 * `virtual:react-three-engine/objects` and exposes helper
 * functions used by the engine's store and UI.
 */
import type { CustomObjectEntry, CustomObjectMeta } from "./customObjectTypes";

// The virtual module is injected by the Vite plugin at build/dev time.
// It exports `customObjectRegistry` as a `Map<string, CustomObjectEntry>`.
// We import it lazily so that SSR / non-Vite environments don't hard-fail.
let _registry: Map<string, CustomObjectEntry> | null = null;

async function loadRegistry(): Promise<Map<string, CustomObjectEntry>> {
  if (_registry) return _registry;
  try {
    const mod = await import("virtual:react-three-engine/objects");
    _registry = mod.customObjectRegistry as Map<string, CustomObjectEntry>;
  } catch {
    _registry = new Map();
  }
  return _registry;
}

/**
 * Synchronously returns the registry if already loaded, otherwise `null`.
 * Call `initCustomObjectRegistry()` once at app start to ensure it is populated.
 */
export function getCustomObjectRegistry(): Map<string, CustomObjectEntry> | null {
  return _registry;
}

/**
 * Initialises the custom object registry by importing the virtual module.
 * Call this once near your app entry point (e.g. inside `App.tsx` before
 * rendering the scene).
 */
export async function initCustomObjectRegistry(): Promise<void> {
  await loadRegistry();
}

/**
 * Returns metadata (label + icon) for all registered custom kinds.
 * Used by the Hierarchy pane's "add" dropdown.
 */
export function getCustomObjectKinds(): { kind: string; meta: CustomObjectMeta }[] {
  if (!_registry) return [];
  return Array.from(_registry.entries()).map(([kind, entry]) => ({
    kind,
    meta: entry.meta,
  }));
}

/**
 * Creates a new instance of the custom object for the given `kind`.
 * Returns `null` when `kind` is not registered.
 */
export function makeCustomObject(kind: string): import("three").Object3D | null {
  if (!_registry) return null;
  const entry = _registry.get(kind);
  if (!entry) return null;
  const f = entry.factory;
  // Support both a factory function `() => new Foo()` and a bare class constructor `Foo`.
  // ES classes are non-callable without `new`; detect by checking the prototype descriptor.
  const isClass =
    typeof f === "function" &&
    Object.getOwnPropertyDescriptor(f, "prototype")?.writable === false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return isClass ? new (f as any)() : (f as () => import("three").Object3D)();
}
/**
 * Returns `true` when `kind` is a registered custom object kind.
 */
export function isCustomObjectKind(kind: string): boolean {
  if (!_registry) return false;
  return _registry.has(kind);
}
