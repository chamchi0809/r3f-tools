/**
 * objectInspector.ts
 *
 * Runtime property introspection for Three.js objects.
 *
 * Strategy:
 * - Collect ALL own property names from the instance (constructor-assigned props)
 * - Collect ALL getter/setter descriptors from the prototype chain
 * - For each key, classify its runtime value type
 * - Group by the class level that "owns" it:
 *     - If it's a getter on a prototype → assign to that prototype's class
 *     - If it's an own instance property → assign to the instance's constructor class
 *   The most-derived class level wins (we assign to the first class in the chain
 *   that has a descriptor for the key, or fall back to the leaf class).
 *
 * Sub-object support:
 * - If a property value is a plain object (not a primitive/Color/Vector) that has
 *   an inspectable prototype chain, it is classified as "object" and its own
 *   PropGroup[] is attached to PropInfo.subGroups. AutoField renders these as
 *   a collapsible nested section.
 */
import * as THREE from "three/webgpu";

// ─── value type classification ───────────────────────────────────────────────

export type PropValueType =
  | "number"
  | "boolean"
  | "string"
  | "color"      // THREE.Color
  | "vector2"    // THREE.Vector2
  | "vector3"    // THREE.Vector3
  | "vector4"    // THREE.Vector4
  | "euler"      // THREE.Euler
  | "texture"    // THREE.Texture (texture map slot)
  | "object"     // inspectable sub-object
  | "unsupported";

export interface PropInfo {
  key: string;
  valueType: PropValueType;
  /** Populated when valueType === "object" */
  subGroups?: PropGroup[];
}

export interface PropGroup {
  /** Class name, e.g. "Object3D", "Mesh", "MeshStandardMaterial" */
  className: string;
  props: PropInfo[];
}

// ─── skip list ───────────────────────────────────────────────────────────────

const SKIP_KEYS = new Set([
  // identity / internal
  "uuid", "id", "type",
  // managed by transform section
  "position", "rotation", "scale", "quaternion", "up",
  // matrices (heavy / internal)
  "matrix", "matrixWorld", "matrixWorldInverse", "projectionMatrix",
  "projectionMatrixInverse", "normalMatrix",
  // parent/children hierarchy
  "parent", "children",
  // complex objects / arrays not suitable for editing
  "layers", "animations", "morphTargetInfluences", "morphTargetDictionary",
  "geometry", "material", "skeleton", "bindMatrix", "bindMatrixInverse",
  // event system
  "listeners", "_listeners",
  // buffers / heavy data
  "attributes", "index", "morphAttributes", "morphTargetsRelative",
  "groups", "drawRange", "boundingBox", "boundingSphere",
  // render internals
  "programs", "clippingPlanes", "userData",
  "extensions", "defines", "uniforms", "glslVersion",
  "iridescenceThicknessRange",
  // shadow sub-object internals (render textures)
  "mapPass",
  // r3f internals
  "__r3f",
]);

/** Keys that represent texture map slots — null value is still renderable as a TextureField. */
const TEXTURE_SLOT_KEYS = new Set([
  "map", "normalMap", "roughnessMap", "metalnessMap", "aoMap",
  "emissiveMap", "lightMap", "bumpMap", "displacementMap",
  "alphaMap", "envMap", "gradientMap", "clearcoatMap",
  "clearcoatNormalMap", "clearcoatRoughnessMap",
  "transmissionMap", "thicknessMap", "sheenColorMap",
  "specularIntensityMap", "specularColorMap",
  "anisotropyMap", "iridescenceMap",
]);

function shouldSkipKey(key: string): boolean {
  if (SKIP_KEYS.has(key)) return true;
  if (key.startsWith("_")) return true;
  // "is*" and "has*" flag properties
  if (/^is[A-Z]/.test(key)) return true;
  if (/^has[A-Z]/.test(key)) return true;
  return false;
}

// ─── value type classification ────────────────────────────────────────────────

function classifyValue(value: unknown): PropValueType {
  if (value instanceof THREE.Color)   return "color";
  if (value instanceof THREE.Euler)   return "euler";
  if (value instanceof THREE.Vector4) return "vector4";
  if (value instanceof THREE.Vector3) return "vector3";
  if (value instanceof THREE.Vector2) return "vector2";
  if (value instanceof THREE.Texture) return "texture";
  if (typeof value === "number")      return "number";
  if (typeof value === "boolean")     return "boolean";
  if (typeof value === "string")      return "string";
  // Guard: arrays, typed arrays, ArrayBuffer, DOM nodes — never inspectable sub-objects
  if (Array.isArray(value))           return "unsupported";
  if (ArrayBuffer.isView(value))      return "unsupported";
  if (value instanceof ArrayBuffer)   return "unsupported";
  if (typeof window !== "undefined" && value instanceof Element) return "unsupported";
  // Plain object with an inspectable prototype chain → sub-object
  if (value !== null && typeof value === "object") {
    const chain = protoChain(value as object);
    if (chain.length > 0) return "object";
  }
  return "unsupported";
}

// ─── prototype chain ─────────────────────────────────────────────────────────

const STOP_CLASSES = new Set(["EventDispatcher", "Object"]);

function protoChain(obj: object): Array<{ name: string; proto: object }> {
  const chain: Array<{ name: string; proto: object }> = [];
  let proto = Object.getPrototypeOf(obj);
  while (proto && proto !== Object.prototype) {
    const name = (proto.constructor as { name?: string }).name ?? "Unknown";
    if (STOP_CLASSES.has(name)) break;
    chain.push({ name, proto });
    proto = Object.getPrototypeOf(proto);
  }
  return chain; // most-derived first
}

// ─── core introspection ───────────────────────────────────────────────────────

/**
 * For each key, find which class in the chain (most-derived first) has a
 * property descriptor for it. This handles getter-defined properties.
 * If not found on any prototype, returns the leaf class name (index 0).
 */
function findOwnerClass(
  key: string,
  chain: Array<{ name: string; proto: object }>,
): string {
  for (const { name, proto } of chain) {
    if (Object.getOwnPropertyDescriptor(proto, key)) return name;
  }
  // instance-own property → attribute to the leaf class
  return chain[0]?.name ?? "Unknown";
}

/**
 * Recursion guard — tracks which objects are currently being introspected
 * to avoid infinite loops on circular references (e.g. shadow.camera.parent).
 */
const _introspecting = new WeakSet<object>();

function introspect(target: object, debug = false): PropGroup[] {
  if (_introspecting.has(target)) return [];
  _introspecting.add(target);
  try {
    return _introspectInner(target, debug);
  } finally {
    _introspecting.delete(target);
  }
}

function _introspectInner(target: object, debug = false): PropGroup[] {
  const chain = protoChain(target);
  if (chain.length === 0) return [];

  // 1. Collect every relevant key:
  //    - own instance properties (set in constructor)
  //    - getter/setter properties on any prototype level
  const allKeys = new Set<string>();

  for (const key of Object.getOwnPropertyNames(target)) {
    allKeys.add(key);
  }
  for (const { proto } of chain) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      allKeys.add(key);
    }
  }

  // 2. For each key, read its value, classify it, and assign to a class group
  const groupMap = new Map<string, PropInfo[]>();

  for (const key of allKeys) {
    if (!debug && shouldSkipKey(key)) continue;

    // Read value
    let value: unknown;
    try {
      value = (target as Record<string, unknown>)[key];
    } catch {
      continue;
    }

    // Skip non-data — but allow null texture slots (they render as empty TextureField)
    if (typeof value === "function" || value === undefined) continue;
    if (value === null && !TEXTURE_SLOT_KEYS.has(key)) continue;
    const vt = value === null ? "texture" : classifyValue(value);
    if (!debug && vt === "unsupported") continue;

    // Build PropInfo — for sub-objects, attach nested groups
    let subGroups: PropGroup[] | undefined;
    if (vt === "object") {
      subGroups = introspect(value as object, debug);
      // If sub-object has no renderable fields, skip it entirely
      if (!subGroups || subGroups.length === 0) continue;
    }

    // Assign to correct class group
    const className = findOwnerClass(key, chain);
    if (!groupMap.has(className)) groupMap.set(className, []);
    groupMap.get(className)!.push({ key, valueType: vt, subGroups });
  }

  // 3. Return groups ordered by prototype chain (most-derived first)
  //    so sections appear in a logical order (e.g. MeshPhysical → MeshStandard → Material)
  const classOrder = chain.map((c) => c.name);
  const groups: PropGroup[] = [];

  for (const className of classOrder) {
    const props = groupMap.get(className);
    if (props && props.length > 0) {
      // Sort props alphabetically within a group for consistency
      props.sort((a, b) => a.key.localeCompare(b.key));
      groups.push({ className, props });
    }
  }

  // Any keys that mapped to a class not in our chain (shouldn't happen, but safety net)
  for (const [className, props] of groupMap) {
    if (!classOrder.includes(className) && props.length > 0) {
      props.sort((a, b) => a.key.localeCompare(b.key));
      groups.push({ className, props });
    }
  }

  return groups;
}

// ─── public API ──────────────────────────────────────────────────────────────

export function introspectObject(obj: THREE.Object3D, debug = false): PropGroup[] {
  return introspect(obj, debug);
}

export function introspectMaterial(mat: THREE.Material, debug = false): PropGroup[] {
  return introspect(mat, debug);
}

export function introspectGeometry(geo: THREE.BufferGeometry, debug = false): PropGroup[] {
  // Expose geo.parameters as a top-level group first (the user-facing params
  // like width/height/radius are the most useful geometry properties)
  const groups: PropGroup[] = [];
  const paramKeys = new Set<string>();

  const params = (geo as unknown as { parameters?: Record<string, unknown> }).parameters;
  if (params) {
    const paramProps: PropInfo[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "number") paramProps.push({ key, valueType: "number" });
      else if (typeof value === "boolean") paramProps.push({ key, valueType: "boolean" });
      paramKeys.add(key);
    }
    if (paramProps.length > 0) {
      groups.push({ className: "Parameters", props: paramProps });
    }
  }

  // Run standard introspection but filter out parameter keys and "parameters" itself
  const raw = introspect(geo, debug);
  for (const group of raw) {
    const filtered = group.props.filter(
      (p) => p.key !== "parameters" && !paramKeys.has(p.key),
    );
    if (filtered.length > 0) {
      groups.push({ className: group.className, props: filtered });
    }
  }

  return groups;
}
