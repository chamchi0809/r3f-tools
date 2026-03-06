import * as THREE from "three/webgpu";

type JsonObject = Record<string, unknown>;

export type GeometryType =
  | "BoxGeometry"
  | "SphereGeometry"
  | "CylinderGeometry"
  | "ConeGeometry"
  | "PlaneGeometry"
  | "TorusGeometry"
  | "CapsuleGeometry"
  | "BufferGeometry";

export type GeometryParams = JsonObject & {
  type: GeometryType;
  uuid?: string;
  data?: JsonObject;
  userData?: JsonObject;
  vertices?: number[];
  indices?: number[];
};

export type MaterialType =
  | "MeshStandardMaterial"
  | "MeshBasicMaterial"
  | "MeshPhysicalMaterial"
  | "MeshToonMaterial"
  | "MeshNormalMaterial";

export const TEXTURE_MAP_SLOTS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "lightMap",
  "bumpMap",
  "displacementMap",
  "alphaMap",
  "envMap",
  "gradientMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
  "transmissionMap",
  "thicknessMap",
  "sheenColorMap",
  "specularIntensityMap",
  "specularColorMap",
  "anisotropyMap",
  "iridescenceMap",
] as const;

export type TextureMapSlot = (typeof TEXTURE_MAP_SLOTS)[number];

export type SerializedMaterial = JsonObject & {
  type: MaterialType;
  uuid?: string;
  color?: number | string;
  emissive?: number | string;
  maps?: Partial<Record<TextureMapSlot, string>>;
  textures?: JsonObject[];
  images?: JsonObject[];
};

export type LightProps = JsonObject & {
  type?: string;
  uuid?: string;
  color?: number | string;
  groundColor?: number | string;
  shadow?: JsonObject;
};

export interface SerializedShadow {
  bias?: number;
  normalBias?: number;
  radius?: number;
  mapSizeWidth?: number;
  mapSizeHeight?: number;
  cameraNear?: number;
  cameraFar?: number;
  cameraLeft?: number;
  cameraRight?: number;
  cameraTop?: number;
  cameraBottom?: number;
}

export type CameraProps = JsonObject & {
  type?: string;
  uuid?: string;
};

export type MaterialPatch = Partial<SerializedMaterial>;
export type GeometryPatch = Partial<GeometryParams>;
export type LightPatch = Partial<LightProps>;
export type CameraPatch = Partial<CameraProps>;

export type CoreObjectKind =
  | "mesh"
  | "group"
  | "ambientLight"
  | "directionalLight"
  | "pointLight"
  | "perspectiveCamera";

export type Vec3Tuple = [number, number, number];

export interface SerializedObjectSnapshot<Kind extends string = string> {
  uuid: string;
  name: string;
  kind: Kind;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: Vec3Tuple;
  castShadow?: boolean;
  receiveShadow?: boolean;
  geometry?: GeometryParams;
  material?: SerializedMaterial;
  lightProps?: LightProps;
  shadowProps?: SerializedShadow;
  cameraProps?: CameraProps;
  children: SerializedObjectSnapshot<Kind>[];
  tags?: string[];
}

export interface SerializedSceneNode<Kind extends string = string> {
  kind: Kind;
  childUUIDs: string[];
}

export interface GeometryBufferSnapshot {
  positions: Float32Array;
  indices: Uint32Array | null;
}

export interface MaterializeObjectOptions<Kind extends string = string> {
  createCustomObject?: (kind: Kind) => THREE.Object3D | null | undefined;
}

const objectLoader = new THREE.ObjectLoader();
const textureCache = new Map<string, THREE.Texture>();
const MATERIAL_COLOR_KEYS = ["color", "emissive", "sheenColor", "specularColor", "attenuationColor"] as const;
const OBJECT_COLOR_KEYS = ["color", "groundColor"] as const;

function stripMetadata<T extends JsonObject>(json: T): T {
  const next = { ...json };
  delete next.metadata;
  return next;
}

function withUUID<T extends JsonObject & { uuid?: string }>(json: T): T & { uuid: string } {
  return {
    ...json,
    uuid: typeof json.uuid === "string" ? json.uuid : THREE.MathUtils.generateUUID(),
  };
}

function ensureGeometryAttributes(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geo.getAttribute("position")) {
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
  }
  const vertCount = geo.getAttribute("position").count;
  if (!geo.getAttribute("normal")) {
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
  }
  if (!geo.getAttribute("uv")) {
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(vertCount * 2), 2));
  }
  return geo;
}

export function buildRawBufferGeometry(snapshot: GeometryBufferSnapshot): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const position = new Float32Array(snapshot.positions);
  geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
  ensureGeometryAttributes(geo);

  if (snapshot.indices) {
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(snapshot.indices), 1));
  }
  if (position.length > 0) geo.computeVertexNormals();
  geo.userData.r3eEdited = true;
  return geo;
}

export function applyRawBufferGeometry(geo: THREE.BufferGeometry, snapshot: GeometryBufferSnapshot): void {
  const positions = new Float32Array(snapshot.positions);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  ensureGeometryAttributes(geo);

  if (snapshot.indices) {
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(snapshot.indices), 1));
  } else {
    geo.setIndex(null);
  }

  if (positions.length > 0) geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.userData.r3eEdited = true;
}

export function snapshotRawBufferGeometry(geo: THREE.BufferGeometry): GeometryBufferSnapshot | null {
  const position = geo.getAttribute("position");
  if (!position) return null;

  const index = geo.getIndex();
  return {
    positions: new Float32Array(position.array as Float32Array),
    indices: index ? new Uint32Array(index.array as Uint32Array) : null,
  };
}

function buildLegacyBufferGeometry(vertices: number[] = [], indices: number[] = []): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const position = vertices.length > 0 ? new Float32Array(vertices) : new Float32Array([0, 0, 0]);
  geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
  ensureGeometryAttributes(geo);
  if (indices.length > 0) {
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  }
  if (vertices.length > 0) geo.computeVertexNormals();
  geo.userData.r3eEdited = true;
  return geo;
}

function serializeGeometry(geo: THREE.BufferGeometry): GeometryParams {
  const source = geo.userData.r3eEdited && geo.type !== "BufferGeometry"
    ? new THREE.BufferGeometry().copy(geo)
    : geo;
  const json = stripMetadata(source.toJSON() as GeometryParams);
  if (json.type === "CapsuleGeometry") {
    const length = typeof json.length === "number"
      ? json.length
      : typeof json.height === "number"
        ? json.height
        : undefined;
    if (length !== undefined) json.length = length;
  }
  delete json.uuid;
  return json;
}

const GEOMETRY_FACTORIES = {
  BoxGeometry: () => new THREE.BoxGeometry(1, 1, 1),
  SphereGeometry: () => new THREE.SphereGeometry(0.5, 32, 16),
  CylinderGeometry: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32, 1),
  ConeGeometry: () => new THREE.ConeGeometry(0.5, 1, 32, 1),
  PlaneGeometry: () => new THREE.PlaneGeometry(1, 1, 1, 1),
  TorusGeometry: () => new THREE.TorusGeometry(0.4, 0.15, 16, 64),
  CapsuleGeometry: () => new THREE.CapsuleGeometry(0.3, 0.6, 8, 16),
  BufferGeometry: () => buildLegacyBufferGeometry(),
} satisfies Record<GeometryType, () => THREE.BufferGeometry>;

function serializeAndDispose(geo: THREE.BufferGeometry): GeometryParams {
  const params = serializeGeometry(geo);
  geo.dispose();
  return params;
}

export const DEFAULT_GEOMETRY_PARAMS: Record<GeometryType, GeometryParams> = {
  BoxGeometry: serializeAndDispose(GEOMETRY_FACTORIES.BoxGeometry()),
  SphereGeometry: serializeAndDispose(GEOMETRY_FACTORIES.SphereGeometry()),
  CylinderGeometry: serializeAndDispose(GEOMETRY_FACTORIES.CylinderGeometry()),
  ConeGeometry: serializeAndDispose(GEOMETRY_FACTORIES.ConeGeometry()),
  PlaneGeometry: serializeAndDispose(GEOMETRY_FACTORIES.PlaneGeometry()),
  TorusGeometry: serializeAndDispose(GEOMETRY_FACTORIES.TorusGeometry()),
  CapsuleGeometry: serializeAndDispose(GEOMETRY_FACTORIES.CapsuleGeometry()),
  BufferGeometry: serializeAndDispose(GEOMETRY_FACTORIES.BufferGeometry()),
};

export function buildGeometry(params: GeometryParams): THREE.BufferGeometry {
  if (params.type === "BufferGeometry" && Array.isArray(params.vertices)) {
    return buildLegacyBufferGeometry(params.vertices, params.indices ?? []);
  }
  if (params.type === "BufferGeometry" && !("data" in params)) {
    return buildLegacyBufferGeometry();
  }
  const payload = withUUID(stripMetadata({
    ...params,
    ...(params.type === "CapsuleGeometry" && typeof params.length === "number"
      ? { height: params.length }
      : {}),
  }));
  const geometry = objectLoader.parseGeometries([payload])[payload.uuid];
  if (geometry instanceof THREE.CapsuleGeometry) {
    const length = typeof params.length === "number"
      ? params.length
      : typeof geometry.parameters.height === "number"
        ? geometry.parameters.height
        : undefined;
    if (length !== undefined) {
      (geometry.parameters as { length?: number }).length = length;
    }
  }
  return ensureGeometryAttributes(geometry);
}

export function readGeometryParams(geo: THREE.BufferGeometry): GeometryParams {
  return serializeGeometry(geo);
}

function urlToRelative(src: string): string {
  if (typeof window !== "undefined" && src.startsWith(window.location.origin)) {
    return src.slice(window.location.origin.length) || "/";
  }
  return src;
}

function loadTexture(url: string, onLoad?: () => void): THREE.Texture {
  if (textureCache.has(url)) {
    onLoad?.();
    return textureCache.get(url)!;
  }
  const tex = new THREE.TextureLoader().load(url, (t) => {
    t.needsUpdate = true;
    onLoad?.();
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.r3eUrl = url;
  textureCache.set(url, tex);
  return tex;
}

export function applyMaps(
  mat: THREE.Material,
  maps: Partial<Record<TextureMapSlot, string>> | undefined,
  onLoad?: () => void,
): void {
  if (!maps) return;
  const target = mat as unknown as Record<string, THREE.Texture | null>;
  for (const slot of TEXTURE_MAP_SLOTS) {
    if (!(slot in maps)) continue;
    const url = maps[slot];
    if (url) {
      target[slot] = loadTexture(url, onLoad);
    } else {
      const existing = target[slot];
      if (existing instanceof THREE.Texture) existing.dispose();
      target[slot] = null;
    }
  }
  mat.needsUpdate = true;
}

function stripTexturePayload(mat: SerializedMaterial): SerializedMaterial {
  const next: SerializedMaterial = { ...mat };
  delete next.images;
  delete next.textures;
  for (const slot of TEXTURE_MAP_SLOTS) {
    delete (next as Record<string, unknown>)[slot];
  }
  return next;
}

function serializeMaterialWithoutMaps(mat: THREE.Material): SerializedMaterial {
  const clone = mat.clone();
  const target = clone as unknown as Record<string, unknown>;
  for (const slot of TEXTURE_MAP_SLOTS) {
    if (slot in target) target[slot] = null;
  }
  const json = stripTexturePayload(stripMetadata(clone.toJSON() as unknown as SerializedMaterial));
  clone.dispose();
  delete json.uuid;
  return json;
}

function normalizeSerializedMaterial(mat: SerializedMaterial): SerializedMaterial {
  const next: SerializedMaterial = { ...mat };
  const out = next as Record<string, unknown>;
  for (const key of MATERIAL_COLOR_KEYS) {
    const value = out[key];
    if (typeof value === "string") out[key] = new THREE.Color(value).getHex();
  }
  return next;
}

export function buildMaterial(mat: SerializedMaterial): THREE.Material {
  const payload = withUUID(normalizeSerializedMaterial(stripMetadata({ ...mat })));
  const maps = payload.maps;
  delete payload.maps;

  const canParseTextures =
    typeof document !== "undefined" && Array.isArray(payload.images) && Array.isArray(payload.textures);
  let textures: Record<string, THREE.Texture> = {};

  if (canParseTextures) {
    const images = objectLoader.parseImages(payload.images as never[], () => {});
    textures = objectLoader.parseTextures(payload.textures as never[], images);
  }

  const loaderPayload = maps || !canParseTextures ? stripTexturePayload(payload) : payload;
  const material = objectLoader.parseMaterials([loaderPayload], textures)[loaderPayload.uuid!];
  applyMaps(material, maps);
  return material;
}

export function readMaterialProps(mat: THREE.Material): SerializedMaterial {
  const base = serializeMaterialWithoutMaps(mat);

  const target = mat as unknown as Record<string, unknown>;
  const maps: Partial<Record<TextureMapSlot, string>> = {};
  for (const slot of TEXTURE_MAP_SLOTS) {
    const tex = target[slot];
    if (!(tex instanceof THREE.Texture)) continue;
    const stored = tex.userData.r3eUrl as string | undefined;
    const src = stored ?? (tex.image as HTMLImageElement | undefined)?.src;
    if (src) maps[slot] = urlToRelative(src);
  }
  if (Object.keys(maps).length > 0) base.maps = maps;
  return base;
}

function readObjectProps(obj: THREE.Object3D): JsonObject {
  const json = { ...((((obj.toJSON() as unknown as { object?: JsonObject }).object) ?? {}) as JsonObject) };
  delete json.uuid;
  delete json.children;
  delete json.layers;
  delete json.matrix;
  delete json.target;
  return json;
}

function normalizeObjectProps(props: JsonObject): JsonObject {
  const next: JsonObject = { ...props };
  for (const key of OBJECT_COLOR_KEYS) {
    const value = next[key];
    if (typeof value === "string") next[key] = new THREE.Color(value).getHex();
  }
  return next;
}

function isObjectSnapshot(props: JsonObject | undefined): props is JsonObject & { type: string } {
  return typeof props?.type === "string";
}

function applyLegacyLightProps(obj: THREE.Light, props: JsonObject): void {
  const color = props.color;
  if (typeof color === "string" || typeof color === "number") obj.color.set(color);

  const intensity = props.intensity;
  if (typeof intensity === "number") obj.intensity = intensity;

  const castShadow = props.castShadow;
  if (typeof castShadow === "boolean") obj.castShadow = castShadow;

  if (obj instanceof THREE.PointLight) {
    const distance = props.distance;
    const decay = props.decay;
    if (typeof distance === "number") obj.distance = distance;
    if (typeof decay === "number") obj.decay = decay;
  }
}

function applyLegacyCameraProps(obj: THREE.PerspectiveCamera, props: JsonObject): void {
  const fov = props.fov;
  const near = props.near;
  const far = props.far;
  const zoom = props.zoom;
  const filmGauge = props.filmGauge;
  const filmOffset = props.filmOffset;
  const focus = props.focus;

  if (typeof fov === "number") obj.fov = fov;
  if (typeof near === "number") obj.near = near;
  if (typeof far === "number") obj.far = far;
  if (typeof zoom === "number") obj.zoom = zoom;
  if (typeof filmGauge === "number") obj.filmGauge = filmGauge;
  if (typeof filmOffset === "number") obj.filmOffset = filmOffset;
  if (typeof focus === "number") obj.focus = focus;
  obj.updateProjectionMatrix();
}

function applyObjectProps(target: THREE.Object3D, props: JsonObject): void {
  const position = target.position.clone();
  const rotation = target.rotation.clone();
  const scale = target.scale.clone();
  const name = target.name;
  const snapshot = objectLoader.parse({
    metadata: { version: 4.7, type: "Object", generator: "Object3D.toJSON" },
    object: withUUID(normalizeObjectProps(props)),
  });
  target.copy(snapshot, false);
  target.name = name;
  target.position.copy(position);
  target.rotation.copy(rotation);
  target.scale.copy(scale);
  target.updateMatrix();
  if (target instanceof THREE.PerspectiveCamera || target instanceof THREE.OrthographicCamera) {
    target.updateProjectionMatrix();
  }
  const light = target as THREE.Light & { shadow?: THREE.LightShadow };
  const shadowCamera = light.shadow?.camera;
  if (shadowCamera instanceof THREE.PerspectiveCamera || shadowCamera instanceof THREE.OrthographicCamera) {
    shadowCamera.updateProjectionMatrix();
  }
}

export function readLightProps(obj: THREE.Object3D): LightProps {
  return readObjectProps(obj) as LightProps;
}

export function readShadowProps(obj: THREE.Object3D): SerializedShadow | undefined {
  const light = obj as { shadow?: THREE.LightShadow };
  if (!light.shadow) return undefined;
  const shadow = light.shadow;
  const camera = shadow.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
  const result: SerializedShadow = {
    bias: shadow.bias,
    normalBias: shadow.normalBias,
    radius: shadow.radius,
    mapSizeWidth: shadow.mapSize.width,
    mapSizeHeight: shadow.mapSize.height,
    cameraNear: camera.near,
    cameraFar: camera.far,
  };
  if (camera instanceof THREE.OrthographicCamera) {
    result.cameraLeft = camera.left;
    result.cameraRight = camera.right;
    result.cameraTop = camera.top;
    result.cameraBottom = camera.bottom;
  }
  return result;
}

export function applyShadowProps(obj: THREE.Object3D, props: SerializedShadow): void {
  const light = obj as { shadow?: THREE.LightShadow };
  if (!light.shadow) return;
  const shadow = light.shadow;
  if (props.bias !== undefined) shadow.bias = props.bias;
  if (props.normalBias !== undefined) shadow.normalBias = props.normalBias;
  if (props.radius !== undefined) shadow.radius = props.radius;
  if (props.mapSizeWidth !== undefined) shadow.mapSize.width = props.mapSizeWidth;
  if (props.mapSizeHeight !== undefined) shadow.mapSize.height = props.mapSizeHeight;

  const camera = shadow.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
  if (props.cameraNear !== undefined) camera.near = props.cameraNear;
  if (props.cameraFar !== undefined) camera.far = props.cameraFar;

  if (camera instanceof THREE.OrthographicCamera) {
    if (props.cameraLeft !== undefined) camera.left = props.cameraLeft;
    if (props.cameraRight !== undefined) camera.right = props.cameraRight;
    if (props.cameraTop !== undefined) camera.top = props.cameraTop;
    if (props.cameraBottom !== undefined) camera.bottom = props.cameraBottom;
  }
  camera.updateProjectionMatrix();
}

export function readCameraProps(obj: THREE.Object3D): CameraProps {
  return readObjectProps(obj) as CameraProps;
}

export function applyLightProps(obj: THREE.Light, props: LightPatch): void {
  if (isObjectSnapshot(props)) applyObjectProps(obj, props);
  else applyLegacyLightProps(obj, props);
}

export function applyCameraProps(obj: THREE.PerspectiveCamera, props: CameraPatch): void {
  if (isObjectSnapshot(props)) applyObjectProps(obj, props);
  else applyLegacyCameraProps(obj, props);
}

export function applySerializedObjectState<Kind extends string>(
  obj: THREE.Object3D,
  snapshot: SerializedObjectSnapshot<Kind>,
): void {
  if (snapshot.castShadow !== undefined) obj.castShadow = snapshot.castShadow;
  if (snapshot.receiveShadow !== undefined) obj.receiveShadow = snapshot.receiveShadow;

  if (obj instanceof THREE.Mesh) {
    if (snapshot.geometry) obj.geometry = buildGeometry(snapshot.geometry);
    if (snapshot.material) obj.material = buildMaterial(snapshot.material);
  }
  if (snapshot.lightProps && obj instanceof THREE.Light) {
    applyLightProps(obj, snapshot.lightProps);
  }
  if (snapshot.shadowProps) {
    applyShadowProps(obj, snapshot.shadowProps);
  }
  if (snapshot.cameraProps && obj instanceof THREE.PerspectiveCamera) {
    applyCameraProps(obj, snapshot.cameraProps);
  }
}

export function materializeSerializedSubtree<Kind extends string>(
  snapshot: SerializedObjectSnapshot<Kind>,
  createObject: (kind: Kind) => THREE.Object3D,
): THREE.Object3D {
  const obj = createObject(snapshot.kind);
  obj.uuid = snapshot.uuid;
  obj.name = snapshot.name;
  obj.position.set(...snapshot.position);
  obj.rotation.set(...snapshot.rotation);
  obj.scale.set(...snapshot.scale);
  applySerializedObjectState(obj, snapshot);

  for (const childSnapshot of snapshot.children) {
    obj.add(materializeSerializedSubtree(childSnapshot, createObject));
  }
  return obj;
}

export function snapshotSerializedSubtree<Kind extends string>(
  rootUUID: string,
  getNode: (uuid: string) => SerializedSceneNode<Kind> | undefined,
  getObject: (uuid: string) => THREE.Object3D | undefined,
  getTags?: (uuid: string) => string[] | undefined,
): SerializedObjectSnapshot<Kind> | null {
  const obj = getObject(rootUUID);
  const node = getNode(rootUUID);
  if (!obj || !node) return null;

  const snapshot: SerializedObjectSnapshot<Kind> = {
    uuid: obj.uuid,
    name: obj.name,
    kind: node.kind,
    position: vec3ToTuple(obj.position),
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    scale: vec3ToTuple(obj.scale),
    castShadow: obj.castShadow,
    receiveShadow: obj.receiveShadow,
    children: node.childUUIDs
      .map((childUUID) => snapshotSerializedSubtree(childUUID, getNode, getObject, getTags))
      .filter((child): child is SerializedObjectSnapshot<Kind> => child !== null),
  };

  if (obj instanceof THREE.Mesh) {
    snapshot.geometry = readGeometryParams(obj.geometry);
    snapshot.material = readMaterialProps(obj.material as THREE.Material);
  }
  if (obj instanceof THREE.Light) {
    snapshot.lightProps = readLightProps(obj);
    const shadow = readShadowProps(obj);
    if (shadow) snapshot.shadowProps = shadow;
  }
  if (obj instanceof THREE.PerspectiveCamera) {
    snapshot.cameraProps = readCameraProps(obj);
  }

  const tags = getTags?.(rootUUID);
  if (tags && tags.length > 0) snapshot.tags = tags;

  return snapshot;
}

export function detectBuiltinObjectKind(obj: THREE.Object3D): CoreObjectKind {
  if (obj instanceof THREE.Mesh) return "mesh";
  if (obj instanceof THREE.AmbientLight) return "ambientLight";
  if (obj instanceof THREE.DirectionalLight) return "directionalLight";
  if (obj instanceof THREE.PointLight) return "pointLight";
  if (obj instanceof THREE.PerspectiveCamera) return "perspectiveCamera";
  return "group";
}

export function vec3ToTuple(vec: THREE.Vector3): Vec3Tuple {
  return vec.toArray() as Vec3Tuple;
}

export function isCoreObjectKind(kind: string): kind is CoreObjectKind {
  return (
    kind === "mesh"
    || kind === "group"
    || kind === "ambientLight"
    || kind === "directionalLight"
    || kind === "pointLight"
    || kind === "perspectiveCamera"
  );
}

export function createBuiltinObject(kind: CoreObjectKind): THREE.Object3D {
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
      const group = new THREE.Group();
      group.name = "Group";
      return group;
    }
    case "ambientLight": {
      const light = new THREE.AmbientLight(0xffffff, 1);
      light.name = "AmbientLight";
      return light;
    }
    case "directionalLight": {
      const light = new THREE.DirectionalLight(0xffffff, 1);
      light.position.set(5, 5, 5);
      light.name = "DirectionalLight";
      return light;
    }
    case "pointLight": {
      const light = new THREE.PointLight(0xffffff, 1, 100);
      light.name = "PointLight";
      return light;
    }
    case "perspectiveCamera": {
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
      camera.name = "PerspectiveCamera";
      camera.position.set(0, 0, 5);
      return camera;
    }
  }
}

export function createObjectForKind<Kind extends string>(
  kind: Kind,
  options: MaterializeObjectOptions<Kind> = {},
): THREE.Object3D {
  if (isCoreObjectKind(kind)) return createBuiltinObject(kind);

  const custom = options.createCustomObject?.(kind);
  if (custom) {
    custom.userData.r3eKind ??= kind;
    return custom;
  }

  const fallback = new THREE.Group();
  fallback.name = String(kind);
  fallback.userData.r3eKind = kind;
  return fallback;
}
