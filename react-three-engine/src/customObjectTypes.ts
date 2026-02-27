import type * as THREE from "three";

/**
 * Augment this interface in your project to register custom `THREE.Object3D`
 * subclasses with the engine. Each key is a unique kind string (matching the
 * key you pass to the Vite plugin's `objects` option). Each value is the
 * concrete `THREE.Object3D` subclass that the factory produces.
 *
 * The engine uses this for proper typing of `sceneActions.addObject(kind)` and
 * `useSceneStore` objects map values when your custom kind is selected.
 *
 * @example
 * // auto-generated or hand-written augmentation
 * declare module "react-three-engine" {
 *   interface CustomObjectKindRegistry {
 *     fireball: import("./objects/Fireball").Fireball;
 *   }
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CustomObjectKindRegistry {}

/**
 * All registered custom kind strings (union of keys from `CustomObjectKindRegistry`).
 * Falls back to `string` when no custom kinds are registered.
 */
export type CustomObjectKind = keyof CustomObjectKindRegistry extends never
  ? never
  : keyof CustomObjectKindRegistry;

/** Resolves the THREE.Object3D subtype for a custom kind. Falls back to `THREE.Object3D`. */
export type CustomObjectRef<K extends string> =
  K extends keyof CustomObjectKindRegistry
    ? CustomObjectKindRegistry[K]
    : THREE.Object3D;

/** Metadata stored alongside each custom object factory in the registry. */
export interface CustomObjectMeta {
  label: string;
  icon: string;
}

/** Entry stored in the runtime custom object registry. */
export interface CustomObjectEntry {
  factory: () => THREE.Object3D;
  meta: CustomObjectMeta;
}
