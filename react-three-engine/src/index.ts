import * as THREE from "three";

export { THREE };
export const version = "0.0.1";
export {
  reactThreeEnginePlugin,
  type ReactThreeEnginePluginOptions,
  type CustomObjectDefinition,
} from "./vitePlugin";
export { default as App } from "./App";
export { prefabRegistry, type ScenePrefab } from "./prefabs/registry";
export {
  useSceneStore,
  sceneActions,
  useModelingStore,
  modelingActions,
  useTagStore,
  tagActions,
  buildMaterial,
  buildGeometry,
  readMaterialProps,
  readGeometryParams,
  readLightProps,
  readCameraProps,
  DEFAULT_GEOMETRY_PARAMS,
  applyMaps,
} from "./store";
export type {
  ObjectKind,
  BuiltinObjectKind,
  SerializedMaterial,
  SerializedObject,
  SerializedShadow,
  TextureMapSlot,
  GeometryType,
  GeometryParams,
  MaterialPatch,
  GeometryPatch,
  LightPatch,
  CameraPatch,
  EditorMode,
  SelectionMode,
  SelectedElement,
  TagName,
} from "./store";
export { TEXTURE_MAP_SLOTS } from "./store";
export { Prefab, type PrefabProps } from "./components";
export type { PrefabTypeRegistry, PrefabRef, PrefabRootType, PrefabObjectNames, PrefabTags, PrefabTree, TreePaths } from "./prefabTypes";
export type {
  CustomObjectKindRegistry,
  CustomObjectKind,
  CustomObjectRef,
  CustomObjectMeta,
  CustomObjectEntry,
} from "./customObjectTypes";
export {
  initCustomObjectRegistry,
  getCustomObjectRegistry,
  getCustomObjectKinds,
  makeCustomObject,
  isCustomObjectKind,
} from "./customObjectRegistry";
export {
  registerInspectorFieldRenderer,
  type FieldRenderer,
  type FieldRendererProps,
} from "./components/InspectorPane";
export type { PropValueType, PropInfo, PropGroup } from "./components/objectInspector";
export {
  introspectObject,
  introspectMaterial,
  introspectGeometry,
} from "./components/objectInspector";
export { loadGltfFile } from "./gltfLoader";
