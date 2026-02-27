import { create, type StoreApi } from "zustand";
import { type UseBoundStore } from "zustand/react";
import * as THREE from "three/webgpu";
import { makeCustomObject, isCustomObjectKind } from "../customObjectRegistry";
import type { CustomObjectKind } from "../customObjectTypes";

export type BuiltinObjectKind =
  | "mesh"
  | "group"
  | "ambientLight"
  | "directionalLight"
  | "pointLight"
  | "perspectiveCamera";

/** All possible object kind strings — builtin + user-registered custom kinds. */
export type ObjectKind = BuiltinObjectKind | CustomObjectKind;

export type GeometryType =
  | "BoxGeometry"
  | "SphereGeometry"
  | "CylinderGeometry"
  | "ConeGeometry"
  | "PlaneGeometry"
  | "TorusGeometry"
  | "CapsuleGeometry";

export interface BoxGeometryParams { width: number; height: number; depth: number; widthSegments: number; heightSegments: number; depthSegments: number; }
export interface SphereGeometryParams { radius: number; widthSegments: number; heightSegments: number; }
export interface CylinderGeometryParams { radiusTop: number; radiusBottom: number; height: number; radialSegments: number; heightSegments: number; }
export interface ConeGeometryParams { radius: number; height: number; radialSegments: number; heightSegments: number; }
export interface PlaneGeometryParams { width: number; height: number; widthSegments: number; heightSegments: number; }
export interface TorusGeometryParams { radius: number; tube: number; radialSegments: number; tubularSegments: number; }
export interface CapsuleGeometryParams { radius: number; length: number; capSegments: number; radialSegments: number; }

export type GeometryParams =
  | ({ type: "BoxGeometry" } & BoxGeometryParams)
  | ({ type: "SphereGeometry" } & SphereGeometryParams)
  | ({ type: "CylinderGeometry" } & CylinderGeometryParams)
  | ({ type: "ConeGeometry" } & ConeGeometryParams)
  | ({ type: "PlaneGeometry" } & PlaneGeometryParams)
  | ({ type: "TorusGeometry" } & TorusGeometryParams)
  | ({ type: "CapsuleGeometry" } & CapsuleGeometryParams);

export const DEFAULT_GEOMETRY_PARAMS: Record<GeometryType, GeometryParams> = {
  BoxGeometry:      { type: "BoxGeometry",      width: 1,   height: 1,   depth: 1,   widthSegments: 1,  heightSegments: 1,  depthSegments: 1 },
  SphereGeometry:   { type: "SphereGeometry",   radius: 0.5, widthSegments: 32, heightSegments: 16 },
  CylinderGeometry: { type: "CylinderGeometry", radiusTop: 0.5, radiusBottom: 0.5, height: 1, radialSegments: 32, heightSegments: 1 },
  ConeGeometry:     { type: "ConeGeometry",     radius: 0.5, height: 1, radialSegments: 32, heightSegments: 1 },
  PlaneGeometry:    { type: "PlaneGeometry",    width: 1,   height: 1,   widthSegments: 1,  heightSegments: 1 },
  TorusGeometry:    { type: "TorusGeometry",    radius: 0.4, tube: 0.15, radialSegments: 16, tubularSegments: 64 },
  CapsuleGeometry:  { type: "CapsuleGeometry",  radius: 0.3, length: 0.6, capSegments: 8,  radialSegments: 16 },
};

export function buildGeometry(params: GeometryParams): THREE.BufferGeometry {
  switch (params.type) {
    case "BoxGeometry":      return new THREE.BoxGeometry(params.width, params.height, params.depth, params.widthSegments, params.heightSegments, params.depthSegments);
    case "SphereGeometry":   return new THREE.SphereGeometry(params.radius, params.widthSegments, params.heightSegments);
    case "CylinderGeometry": return new THREE.CylinderGeometry(params.radiusTop, params.radiusBottom, params.height, params.radialSegments, params.heightSegments);
    case "ConeGeometry":     return new THREE.ConeGeometry(params.radius, params.height, params.radialSegments, params.heightSegments);
    case "PlaneGeometry":    return new THREE.PlaneGeometry(params.width, params.height, params.widthSegments, params.heightSegments);
    case "TorusGeometry":    return new THREE.TorusGeometry(params.radius, params.tube, params.radialSegments, params.tubularSegments);
    case "CapsuleGeometry":  return new THREE.CapsuleGeometry(params.radius, params.length, params.capSegments, params.radialSegments);
  }
}

export function readGeometryParams(geo: THREE.BufferGeometry): GeometryParams {
  if (geo instanceof THREE.BoxGeometry) { const p = geo.parameters; return { type: "BoxGeometry", width: p.width ?? 1, height: p.height ?? 1, depth: p.depth ?? 1, widthSegments: p.widthSegments ?? 1, heightSegments: p.heightSegments ?? 1, depthSegments: p.depthSegments ?? 1 }; }
  if (geo instanceof THREE.SphereGeometry) { const p = geo.parameters; return { type: "SphereGeometry", radius: p.radius ?? 0.5, widthSegments: p.widthSegments ?? 32, heightSegments: p.heightSegments ?? 16 }; }
  if (geo instanceof THREE.CylinderGeometry) { const p = geo.parameters; return { type: "CylinderGeometry", radiusTop: p.radiusTop ?? 0.5, radiusBottom: p.radiusBottom ?? 0.5, height: p.height ?? 1, radialSegments: p.radialSegments ?? 32, heightSegments: p.heightSegments ?? 1 }; }
  if (geo instanceof THREE.ConeGeometry) { const p = geo.parameters; return { type: "ConeGeometry", radius: p.radius ?? 0.5, height: p.height ?? 1, radialSegments: p.radialSegments ?? 32, heightSegments: p.heightSegments ?? 1 }; }
  if (geo instanceof THREE.PlaneGeometry) { const p = geo.parameters; return { type: "PlaneGeometry", width: p.width ?? 1, height: p.height ?? 1, widthSegments: p.widthSegments ?? 1, heightSegments: p.heightSegments ?? 1 }; }
  if (geo instanceof THREE.TorusGeometry) { const p = geo.parameters; return { type: "TorusGeometry", radius: p.radius ?? 0.4, tube: p.tube ?? 0.15, radialSegments: p.radialSegments ?? 16, tubularSegments: p.tubularSegments ?? 64 }; }
  if (geo instanceof THREE.CapsuleGeometry) { const p = geo.parameters; return { type: "CapsuleGeometry", radius: p.radius ?? 0.3, length: (p as Record<string, number>).length ?? 0.6, capSegments: p.capSegments ?? 8, radialSegments: p.radialSegments ?? 16 }; }
  return { ...DEFAULT_GEOMETRY_PARAMS.BoxGeometry };
}

export type MaterialType =
  | "MeshStandardMaterial"
  | "MeshBasicMaterial"
  | "MeshPhysicalMaterial"
  | "MeshToonMaterial"
  | "MeshNormalMaterial";

export interface SerializedMaterial {
  type: MaterialType;
  color: string;
  roughness?: number;
  metalness?: number;
  transmission?: number;
  thickness?: number;
  ior?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  opacity?: number;
  transparent?: boolean;
  wireframe?: boolean;
  flatShading?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  /** Texture map URLs keyed by slot name (e.g. "map", "normalMap"). */
  maps?: Partial<Record<TextureMapSlot, string>>;
}

/** All texture map slot names exposed by the texture picker. */
export const TEXTURE_MAP_SLOTS = [
  "map", "normalMap", "roughnessMap", "metalnessMap", "aoMap",
  "emissiveMap", "lightMap", "bumpMap", "displacementMap",
  "alphaMap", "envMap", "gradientMap", "clearcoatMap",
  "clearcoatNormalMap", "clearcoatRoughnessMap",
  "transmissionMap", "thicknessMap", "sheenColorMap",
  "specularIntensityMap", "specularColorMap",
  "anisotropyMap", "iridescenceMap",
] as const;

export type TextureMapSlot = typeof TEXTURE_MAP_SLOTS[number];

const _textureCache = new Map<string, THREE.Texture>();

/**
 * Strips the current page origin from a URL so texture paths are saved as
 * root-relative paths (e.g. "/textures/foo.jpg") instead of absolute URLs
 * (e.g. "http://localhost:5174/textures/foo.jpg") that break in production.
 */
function _urlToRelative(src: string): string {
  if (typeof window !== "undefined" && src.startsWith(window.location.origin)) {
    return src.slice(window.location.origin.length) || "/";
  }
  return src;
}

function loadTexture(url: string, onLoad?: () => void): THREE.Texture {
  if (_textureCache.has(url)) {
    // Already cached — image may already be loaded; fire onLoad immediately.
    onLoad?.();
    return _textureCache.get(url)!;
  }
  const tex = new THREE.TextureLoader().load(url, (t) => {
    t.needsUpdate = true;
    onLoad?.();
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  // Store the original URL so _readMaps can recover a relative path on save.
  tex.userData.r3eUrl = url;
  _textureCache.set(url, tex);
  return tex;
}

export function applyMaps(
  mat: THREE.Material,
  maps: Partial<Record<TextureMapSlot, string>> | undefined,
  onLoad?: () => void,
): void {
  if (!maps) return;
  const m = mat as unknown as Record<string, THREE.Texture | null>;
  for (const slot of TEXTURE_MAP_SLOTS) {
    if (!(slot in maps)) continue;
    const url = maps[slot];
    if (url) {
      m[slot] = loadTexture(url, onLoad);
    } else {
      const existing = m[slot];
      if (existing instanceof THREE.Texture) { existing.dispose(); }
      m[slot] = null;
    }
  }
  mat.needsUpdate = true;
}

export function buildMaterial(mat: SerializedMaterial): THREE.Material {
  switch (mat.type) {
    case "MeshPhysicalMaterial": {
      const m = new THREE.MeshPhysicalMaterial();
      m.color.set(mat.color); m.roughness = mat.roughness ?? 0.5; m.metalness = mat.metalness ?? 0;
      m.transmission = mat.transmission ?? 0; m.thickness = mat.thickness ?? 0; m.ior = mat.ior ?? 1.5;
      m.clearcoat = mat.clearcoat ?? 0; m.clearcoatRoughness = mat.clearcoatRoughness ?? 0;
      m.opacity = mat.opacity ?? 1; m.transparent = mat.transparent ?? false;
      m.wireframe = mat.wireframe ?? false; m.flatShading = mat.flatShading ?? false;
      if (mat.emissive) { m.emissive.set(mat.emissive); m.emissiveIntensity = mat.emissiveIntensity ?? 1; }
      applyMaps(m, mat.maps);
      return m;
    }
    case "MeshToonMaterial": {
      const m = new THREE.MeshToonMaterial();
      m.color.set(mat.color); m.opacity = mat.opacity ?? 1; m.transparent = mat.transparent ?? false;
      m.wireframe = mat.wireframe ?? false;
      if (mat.emissive) { m.emissive.set(mat.emissive); m.emissiveIntensity = mat.emissiveIntensity ?? 1; }
      applyMaps(m, mat.maps);
      return m;
    }
    case "MeshNormalMaterial": {
      const m = new THREE.MeshNormalMaterial();
      m.wireframe = mat.wireframe ?? false; m.flatShading = mat.flatShading ?? false;
      m.opacity = mat.opacity ?? 1; m.transparent = mat.transparent ?? false;
      applyMaps(m, mat.maps);
      return m;
    }
    case "MeshBasicMaterial": {
      const m = new THREE.MeshBasicMaterial();
      m.color.set(mat.color); m.opacity = mat.opacity ?? 1; m.transparent = mat.transparent ?? false;
      m.wireframe = mat.wireframe ?? false;
      applyMaps(m, mat.maps);
      return m;
    }
    default: {
      const m = new THREE.MeshStandardMaterial();
      m.color.set(mat.color); m.roughness = mat.roughness ?? 0.5; m.metalness = mat.metalness ?? 0;
      m.opacity = mat.opacity ?? 1; m.transparent = mat.transparent ?? false;
      m.wireframe = mat.wireframe ?? false; m.flatShading = mat.flatShading ?? false;
      if (mat.emissive) { m.emissive.set(mat.emissive); m.emissiveIntensity = mat.emissiveIntensity ?? 1; }
      applyMaps(m, mat.maps);
      return m;
    }
  }
}

export function readMaterialProps(mat: THREE.Material): SerializedMaterial {
  const base: SerializedMaterial = {
    type: _matType(mat), color: "#888888",
    opacity: mat.opacity, transparent: mat.transparent,
    wireframe: (mat as THREE.MeshStandardMaterial).wireframe ?? false,
  };
  if (mat instanceof THREE.MeshNormalMaterial) {
    _readMaps(mat, base);
    return base;
  }
  const colored = mat as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
  base.color = `#${colored.color.getHexString()}`;
  if ("flatShading" in mat) base.flatShading = (mat as THREE.MeshStandardMaterial).flatShading;
  if ("emissive" in mat) {
    base.emissive = `#${(mat as THREE.MeshStandardMaterial).emissive.getHexString()}`;
    base.emissiveIntensity = (mat as THREE.MeshStandardMaterial).emissiveIntensity;
  }
  if (mat instanceof THREE.MeshStandardMaterial) { base.roughness = mat.roughness; base.metalness = mat.metalness; }
  if (mat instanceof THREE.MeshPhysicalMaterial) {
    base.transmission = mat.transmission; base.thickness = mat.thickness;
    base.ior = mat.ior; base.clearcoat = mat.clearcoat; base.clearcoatRoughness = mat.clearcoatRoughness;
  }
  _readMaps(mat, base);
  return base;
}

function _readMaps(mat: THREE.Material, out: SerializedMaterial): void {
  const m = mat as unknown as Record<string, unknown>;
  const maps: Partial<Record<TextureMapSlot, string>> = {};
  for (const slot of TEXTURE_MAP_SLOTS) {
    const tex = m[slot];
    if (tex instanceof THREE.Texture) {
      // Prefer the stored original URL (set by loadTexture / TextureField.pick).
      // Fall back to image.src and strip the origin so we always save a
      // root-relative path like "/foo.jpg" instead of "http://localhost:5174/foo.jpg".
      const stored = tex.userData.r3eUrl as string | undefined;
      const src = stored ?? (tex.image as HTMLImageElement | undefined)?.src;
      if (src) maps[slot] = _urlToRelative(src);
    }
  }
  if (Object.keys(maps).length > 0) out.maps = maps;
}

function _matType(mat: THREE.Material): MaterialType {
  if (mat instanceof THREE.MeshPhysicalMaterial) return "MeshPhysicalMaterial";
  if (mat instanceof THREE.MeshStandardMaterial) return "MeshStandardMaterial";
  if (mat instanceof THREE.MeshBasicMaterial) return "MeshBasicMaterial";
  if (mat instanceof THREE.MeshToonMaterial) return "MeshToonMaterial";
  if (mat instanceof THREE.MeshNormalMaterial) return "MeshNormalMaterial";
  return "MeshStandardMaterial";
}

// ─── Light / Camera / Shadow props ───────────────────────────────────────────

export interface LightProps {
  color: string;
  intensity: number;
  distance?: number;  // PointLight only
  decay?: number;     // PointLight only
  castShadow?: boolean;
}

export interface SerializedShadow {
  bias?: number;
  normalBias?: number;
  radius?: number;
  mapSizeWidth?: number;
  mapSizeHeight?: number;
  cameraNear?: number;
  cameraFar?: number;
  // OrthographicCamera frustum (DirectionalLight / SpotLight)
  cameraLeft?: number;
  cameraRight?: number;
  cameraTop?: number;
  cameraBottom?: number;
}

export interface CameraProps {
  fov: number;
  near: number;
  far: number;
  zoom: number;
  filmGauge: number;
  filmOffset: number;
  focus: number;
}

export function readLightProps(obj: THREE.Object3D): LightProps {
  const light = obj as THREE.Light;
  const base: LightProps = {
    color: `#${light.color.getHexString()}`,
    intensity: light.intensity,
    castShadow: light.castShadow,
  };
  if (obj instanceof THREE.PointLight) {
    base.distance = obj.distance;
    base.decay = obj.decay;
  }
  return base;
}

export function readShadowProps(obj: THREE.Object3D): SerializedShadow | undefined {
  const light = obj as THREE.Light;
  if (!light.shadow) return undefined;
  const s = light.shadow;
  const result: SerializedShadow = {
    bias: s.bias,
    normalBias: s.normalBias,
    radius: s.radius,
    mapSizeWidth: s.mapSize.width,
    mapSizeHeight: s.mapSize.height,
    cameraNear: (s.camera as THREE.PerspectiveCamera).near,
    cameraFar: (s.camera as THREE.PerspectiveCamera).far,
  };
  const ortho = s.camera as THREE.OrthographicCamera;
  if (ortho.left !== undefined) {
    result.cameraLeft = ortho.left;
    result.cameraRight = ortho.right;
    result.cameraTop = ortho.top;
    result.cameraBottom = ortho.bottom;
  }
  return result;
}

export function applyShadowProps(obj: THREE.Object3D, props: SerializedShadow): void {
  const light = obj as THREE.Light;
  if (!light.shadow) return;
  const s = light.shadow;
  if (props.bias !== undefined) s.bias = props.bias;
  if (props.normalBias !== undefined) s.normalBias = props.normalBias;
  if (props.radius !== undefined) s.radius = props.radius;
  if (props.mapSizeWidth !== undefined) s.mapSize.width = props.mapSizeWidth;
  if (props.mapSizeHeight !== undefined) s.mapSize.height = props.mapSizeHeight;
  if (props.cameraNear !== undefined) (s.camera as THREE.PerspectiveCamera).near = props.cameraNear;
  if (props.cameraFar !== undefined) (s.camera as THREE.PerspectiveCamera).far = props.cameraFar;
  const ortho = s.camera as THREE.OrthographicCamera;
  if (props.cameraLeft !== undefined) ortho.left = props.cameraLeft;
  if (props.cameraRight !== undefined) ortho.right = props.cameraRight;
  if (props.cameraTop !== undefined) ortho.top = props.cameraTop;
  if (props.cameraBottom !== undefined) ortho.bottom = props.cameraBottom;
  (s.camera as THREE.PerspectiveCamera).updateProjectionMatrix();
}

export function readCameraProps(obj: THREE.Object3D): CameraProps {
  const cam = obj as THREE.PerspectiveCamera;
  return {
    fov: cam.fov,
    near: cam.near,
    far: cam.far,
    zoom: cam.zoom,
    filmGauge: cam.filmGauge,
    filmOffset: cam.filmOffset,
    focus: cam.focus,
  };
}

export interface SerializedObject {
  uuid: string;
  name: string;
  kind: ObjectKind;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
  geometry?: GeometryParams;
  material?: SerializedMaterial;
  lightProps?: LightProps;
  shadowProps?: SerializedShadow;
  cameraProps?: CameraProps;
  children: SerializedObject[];
}

export interface SceneNode {
  uuid: string;
  name: string;
  kind: ObjectKind;
  parentUUID: string | null;
  childUUIDs: string[];
}
interface SceneState {
  rootUUIDs: string[];
  nodes: Map<string, SceneNode>;
  objects: Map<string, THREE.Object3D>;
  selectedUUID: string | null;
  version: number;
  pendingAdd: { kind: ObjectKind; parentUUID: string | null } | null;
  pendingRemove: string | null;
  pendingDeserialize: SerializedObject[] | null;
  invalidate: () => void;
  select: (uuid: string | null) => void;
  addObject: (kind: ObjectKind, parentUUID?: string | null) => void;
  removeObject: (uuid: string) => void;
  registerObject: (obj: THREE.Object3D, kind: ObjectKind, parentUUID: string | null) => void;
  unregisterObject: (uuid: string) => void;
  clearPendingAdd: () => void;
  clearPendingRemove: () => void;
  clearPendingDeserialize: () => void;
  setTransform: (
    uuid: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number],
  ) => void;
  setMaterialColor: (uuid: string, color: string) => void;
  setMaterialType: (uuid: string, type: MaterialType) => void;
  setMaterialProps: (uuid: string, props: Partial<Omit<SerializedMaterial, "type">>) => void;
  setTextureMap: (uuid: string, slot: TextureMapSlot, url: string | null) => void;
  setGeometryType: (uuid: string, type: GeometryType) => void;
  setGeometryParams: (uuid: string, params: Partial<GeometryParams>) => void;
  serialize: () => SerializedObject[];
  deserialize: (nodes: SerializedObject[]) => void;
  setLightProps: (uuid: string, props: Partial<LightProps>) => void;
  setCameraProps: (uuid: string, props: Partial<CameraProps>) => void;
}

export function makeObject(kind: ObjectKind): THREE.Object3D {
  switch (kind) {
    case "mesh": {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: "#888888" }),
      );
      mesh.name = "Mesh";
      return mesh;
    }
    case "group": {
      const g = new THREE.Group();
      g.name = "Group";
      return g;
    }
    case "ambientLight": {
      const l = new THREE.AmbientLight(0xffffff, 1);
      l.name = "AmbientLight";
      return l;
    }
    case "directionalLight": {
      const l = new THREE.DirectionalLight(0xffffff, 1);
      l.position.set(5, 5, 5);
      l.name = "DirectionalLight";
      return l;
    }
    case "pointLight": {
      const l = new THREE.PointLight(0xffffff, 1, 100);
      l.name = "PointLight";
      return l;
    }
    case "perspectiveCamera": {
      const c = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
      c.name = "PerspectiveCamera";
      c.position.set(0, 0, 5);
      return c;
    }
    default: {
      // Custom object kind — delegate to the runtime registry.
      const custom = makeCustomObject(kind as string);
      if (custom) {
        // Stamp the kind so detectKind can recover it later.
        custom.userData.r3eKind = kind;
        return custom;
      }
      // Fallback: plain Group so the scene doesn't hard-fail.
      const fallback = new THREE.Group();
      fallback.name = String(kind);
      fallback.userData.r3eKind = kind;
      return fallback;
    }
  }
}

function detectKind(obj: THREE.Object3D): ObjectKind {
  // Custom objects are stamped with their kind at creation time.
  if (obj.userData.r3eKind && isCustomObjectKind(obj.userData.r3eKind as string)) {
    return obj.userData.r3eKind as ObjectKind;
  }
  if (obj instanceof THREE.Mesh) return "mesh";
  if (obj instanceof THREE.AmbientLight) return "ambientLight";
  if (obj instanceof THREE.DirectionalLight) return "directionalLight";
  if (obj instanceof THREE.PointLight) return "pointLight";
  if (obj instanceof THREE.PerspectiveCamera) return "perspectiveCamera";
  return "group";
}

function serializeObject(
  obj: THREE.Object3D,
  nodes: Map<string, SceneNode>,
  objects: Map<string, THREE.Object3D>,
): SerializedObject {
  const node: SerializedObject = {
    uuid: obj.uuid,
    name: obj.name,
    kind: detectKind(obj),
    position: obj.position.toArray() as [number, number, number],
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    scale: obj.scale.toArray() as [number, number, number],
    castShadow: obj.castShadow,
    receiveShadow: obj.receiveShadow,
    children: (nodes.get(obj.uuid)?.childUUIDs ?? [])
      .map((childUUID) => {
        const childObj = objects.get(childUUID);
        return childObj ? serializeObject(childObj, nodes, objects) : null;
      })
      .filter(Boolean) as SerializedObject[],
  };
  if (obj instanceof THREE.Mesh) {
    node.geometry = readGeometryParams(obj.geometry);
    node.material = readMaterialProps(obj.material as THREE.Material);
  }
  if (obj instanceof THREE.Light) {
    node.lightProps = readLightProps(obj);
    const shadow = readShadowProps(obj);
    if (shadow) node.shadowProps = shadow;
  }
  if (obj instanceof THREE.PerspectiveCamera) {
    node.cameraProps = readCameraProps(obj);
  }
  return node;
}

export function applySerializedObject(obj: THREE.Object3D, node: SerializedObject): void {
  if (node.castShadow !== undefined) obj.castShadow = node.castShadow;
  if (node.receiveShadow !== undefined) obj.receiveShadow = node.receiveShadow;
  if (node.lightProps && obj instanceof THREE.Light) {
    const lp = node.lightProps;
    if (lp.color !== undefined) obj.color.set(lp.color);
    if (lp.intensity !== undefined) obj.intensity = lp.intensity;
    if (lp.castShadow !== undefined) obj.castShadow = lp.castShadow;
    if (obj instanceof THREE.PointLight) {
      if (lp.distance !== undefined) obj.distance = lp.distance;
      if (lp.decay !== undefined) obj.decay = lp.decay;
    }
  }
  if (node.shadowProps) {
    applyShadowProps(obj, node.shadowProps);
  }
  if (node.cameraProps && obj instanceof THREE.PerspectiveCamera) {
    const cp = node.cameraProps;
    if (cp.fov !== undefined) obj.fov = cp.fov;
    if (cp.near !== undefined) obj.near = cp.near;
    if (cp.far !== undefined) obj.far = cp.far;
    if (cp.zoom !== undefined) obj.zoom = cp.zoom;
    if (cp.filmGauge !== undefined) obj.filmGauge = cp.filmGauge;
    if (cp.filmOffset !== undefined) obj.filmOffset = cp.filmOffset;
    if (cp.focus !== undefined) obj.focus = cp.focus;
    obj.updateProjectionMatrix();
  }
}

export const useSceneStore: UseBoundStore<StoreApi<SceneState>> = create<SceneState>(
  (set, get) => ({
    rootUUIDs: [],
    nodes: new Map(),
    objects: new Map(),
    selectedUUID: null,
    version: 0,
    pendingAdd: null,
    pendingRemove: null,
    pendingDeserialize: null,

    invalidate: () => set((s) => ({ version: s.version + 1 })),

    select: (uuid) => set({ selectedUUID: uuid }),

    addObject: (kind, parentUUID = null) => {
      set({ pendingAdd: { kind, parentUUID: parentUUID ?? null } });
    },

    removeObject: (uuid) => {
      set({ pendingRemove: uuid });
    },

    registerObject: (obj, kind, parentUUID) => {
      set((s) => {
        const nodes = new Map(s.nodes);
        const objects = new Map(s.objects);

        objects.set(obj.uuid, obj);
        nodes.set(obj.uuid, {
          uuid: obj.uuid,
          name: obj.name,
          kind,
          parentUUID,
          childUUIDs: [],
        });

        let rootUUIDs = s.rootUUIDs;
        if (parentUUID === null) {
          rootUUIDs = [...s.rootUUIDs, obj.uuid];
        } else {
          const parent = nodes.get(parentUUID);
          if (parent) {
            nodes.set(parentUUID, { ...parent, childUUIDs: [...parent.childUUIDs, obj.uuid] });
          }
        }

        return { nodes, objects, rootUUIDs, version: s.version + 1 };
      });
    },

    unregisterObject: (uuid) => {
      set((s) => {
        const nodes = new Map(s.nodes);
        const objects = new Map(s.objects);
        const node = nodes.get(uuid);

        objects.delete(uuid);
        nodes.delete(uuid);

        let rootUUIDs = s.rootUUIDs;
        if (node?.parentUUID === null) {
          rootUUIDs = s.rootUUIDs.filter((id) => id !== uuid);
        } else if (node?.parentUUID) {
          const parent = nodes.get(node.parentUUID);
          if (parent) {
            nodes.set(node.parentUUID, {
              ...parent,
              childUUIDs: parent.childUUIDs.filter((id) => id !== uuid),
            });
          }
        }

        const selectedUUID = s.selectedUUID === uuid ? null : s.selectedUUID;
        return { nodes, objects, rootUUIDs, selectedUUID, version: s.version + 1 };
      });
    },

    clearPendingAdd: () => set({ pendingAdd: null }),
    clearPendingRemove: () => set({ pendingRemove: null }),
    clearPendingDeserialize: () => set({ pendingDeserialize: null }),

    setTransform: (uuid, position, rotation, scale) => {
      const { objects, invalidate } = get();
      const obj = objects.get(uuid);
      if (!obj) return;
      obj.position.set(...position);
      obj.rotation.set(...rotation);
      obj.scale.set(...scale);
      invalidate();
    },

    setMaterialColor: (uuid, color) => {
      const { objects, invalidate } = get();
      const obj = objects.get(uuid);
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
      mat.color.set(color);
      invalidate();
    },

    setMaterialType: (uuid, type) => {
      const { objects, invalidate } = get();
      const obj = objects.get(uuid);
      if (!(obj instanceof THREE.Mesh)) return;
      const current = readMaterialProps(obj.material as THREE.Material);
      (obj.material as THREE.Material).dispose();
      obj.material = buildMaterial({ ...current, type });
      invalidate();
    },

    setMaterialProps: (uuid, props) => {
      const { objects, invalidate } = get();
      const obj = objects.get(uuid);
      if (!(obj instanceof THREE.Mesh)) return;
      const current = readMaterialProps(obj.material as THREE.Material);
      (obj.material as THREE.Material).dispose();
      obj.material = buildMaterial({ ...current, ...props });
      invalidate();
    },

    setTextureMap: (uuid, slot, url) => {
      const { objects, invalidate } = get();
      const obj = objects.get(uuid);
      if (!(obj instanceof THREE.Mesh)) return;
      // Read current serialized state, update the specific slot, then do a
      // full material rebuild so the WebGPU node graph is recompiled with
      // the new texture binding.
      const current = readMaterialProps(obj.material as THREE.Material);
      const maps = { ...(current.maps ?? {}), [slot]: url ?? undefined };
      if (!url) delete maps[slot as keyof typeof maps];
      (obj.material as THREE.Material).dispose();
      obj.material = buildMaterial({ ...current, maps });
      invalidate();
    },

    setGeometryType: (uuid, type) => {
      const { objects, invalidate } = get();
      const obj = objects.get(uuid);
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      obj.geometry = buildGeometry(DEFAULT_GEOMETRY_PARAMS[type]);
      invalidate();
    },

    setGeometryParams: (uuid, params) => {
      const { objects, invalidate } = get();
      const obj = objects.get(uuid);
      if (!(obj instanceof THREE.Mesh)) return;
      const current = readGeometryParams(obj.geometry);
      obj.geometry.dispose();
      obj.geometry = buildGeometry({ ...current, ...params } as GeometryParams);
      invalidate();
    },

    serialize: () => {
      const { rootUUIDs, nodes, objects } = get();
      return rootUUIDs
        .map((uuid) => {
          const obj = objects.get(uuid);
          return obj ? serializeObject(obj, nodes, objects) : null;
        })
        .filter(Boolean) as SerializedObject[];
    },

    deserialize: (serializedNodes) => {
      set({ pendingDeserialize: serializedNodes, selectedUUID: null });
    },

    setLightProps: (uuid, props) => {
      const { objects, invalidate } = get();
      const obj = objects.get(uuid);
      if (!(obj instanceof THREE.Light)) return;
      if (props.color !== undefined) obj.color.set(props.color);
      if (props.intensity !== undefined) obj.intensity = props.intensity;
      if (props.castShadow !== undefined) obj.castShadow = props.castShadow;
      if (obj instanceof THREE.PointLight) {
        if (props.distance !== undefined) obj.distance = props.distance;
        if (props.decay !== undefined) obj.decay = props.decay;
      }
      invalidate();
    },

    setCameraProps: (uuid, props) => {
      const { objects, invalidate } = get();
      const obj = objects.get(uuid);
      if (!(obj instanceof THREE.PerspectiveCamera)) return;
      if (props.fov !== undefined) obj.fov = props.fov;
      if (props.near !== undefined) obj.near = props.near;
      if (props.far !== undefined) obj.far = props.far;
      if (props.zoom !== undefined) obj.zoom = props.zoom;
      if (props.filmGauge !== undefined) obj.filmGauge = props.filmGauge;
      if (props.filmOffset !== undefined) obj.filmOffset = props.filmOffset;
      if (props.focus !== undefined) obj.focus = props.focus;
      obj.updateProjectionMatrix();
      invalidate();
    },
  }),
);

export const sceneActions: {
  addObject: (kind: ObjectKind, parentUUID?: string | null) => void;
  removeObject: (uuid: string) => void;
  select: (uuid: string | null) => void;
  setTransform: (
    uuid: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number],
  ) => void;
  setMaterialColor: (uuid: string, color: string) => void;
  setMaterialType: (uuid: string, type: MaterialType) => void;
  setMaterialProps: (uuid: string, props: Partial<Omit<SerializedMaterial, "type">>) => void;
  setTextureMap: (uuid: string, slot: TextureMapSlot, url: string | null) => void;
  setGeometryType: (uuid: string, type: GeometryType) => void;
  setGeometryParams: (uuid: string, params: Partial<GeometryParams>) => void;
  serialize: () => SerializedObject[];
  deserialize: (nodes: SerializedObject[]) => void;
  setLightProps: (uuid: string, props: Partial<LightProps>) => void;
  setCameraProps: (uuid: string, props: Partial<CameraProps>) => void;
  invalidate: () => void;
} = {
  addObject: (kind, parentUUID) => useSceneStore.getState().addObject(kind, parentUUID),
  removeObject: (uuid) => useSceneStore.getState().removeObject(uuid),
  select: (uuid) => useSceneStore.getState().select(uuid),
  setTransform: (uuid, position, rotation, scale) =>
    useSceneStore.getState().setTransform(uuid, position, rotation, scale),
  setMaterialColor: (uuid, color) => useSceneStore.getState().setMaterialColor(uuid, color),
  setMaterialType: (uuid, type) => useSceneStore.getState().setMaterialType(uuid, type),
  setMaterialProps: (uuid, props) => useSceneStore.getState().setMaterialProps(uuid, props),
  setTextureMap: (uuid, slot, url) => useSceneStore.getState().setTextureMap(uuid, slot, url),
  setGeometryType: (uuid, type) => useSceneStore.getState().setGeometryType(uuid, type),
  setGeometryParams: (uuid, params) => useSceneStore.getState().setGeometryParams(uuid, params),
  serialize: () => useSceneStore.getState().serialize(),
  deserialize: (nodes) => useSceneStore.getState().deserialize(nodes),
  setLightProps: (uuid, props) => useSceneStore.getState().setLightProps(uuid, props),
  setCameraProps: (uuid, props) => useSceneStore.getState().setCameraProps(uuid, props),
  invalidate: () => useSceneStore.getState().invalidate(),
};
