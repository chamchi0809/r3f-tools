export {
  buildMaterial,
  buildGeometry,
  readMaterialProps,
  readGeometryParams,
  readLightProps,
  readShadowProps,
  applyShadowProps,
  readCameraProps,
  applyMaps,
  applyLightProps,
  applyCameraProps,
  applySerializedObjectState,
  snapshotSerializedSubtree,
  detectBuiltinObjectKind,
  vec3ToTuple,
  createObjectForKind,
  DEFAULT_GEOMETRY_PARAMS,
  TEXTURE_MAP_SLOTS,
} from "./serializationCore";

export type {
  SerializedMaterial,
  GeometryType,
  GeometryParams,
  MaterialType,
  TextureMapSlot,
  LightProps,
  SerializedShadow,
  CameraProps,
  MaterialPatch,
  GeometryPatch,
  LightPatch,
  CameraPatch,
  SerializedObjectSnapshot,
} from "./serializationCore";

export { makeObject } from "./objectFactory";
export { applySerializedObject, serializeObject } from "./sceneSerialization";
export { useSceneStore } from "./sceneStoreState";
export { sceneActions } from "./sceneActions";

export type { SceneState } from "./sceneStoreState";
export type { BuiltinObjectKind, ObjectKind, SerializedObject, SceneNode } from "./sceneTypes";
