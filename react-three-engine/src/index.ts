import * as THREE from "three";

export { THREE };
export const version = "0.0.1";
export { reactThreeEnginePlugin } from "./vitePlugin";
export { default as App } from "./App";
export { prefabRegistry, type ScenePrefab } from "./prefabs/registry";
export { useSceneStore, sceneActions } from "./store";
export type { ObjectKind, SerializedMaterial, SerializedObject } from "./store";
export { Prefab, type PrefabProps } from "./components";
export type { PrefabTypeRegistry, PrefabRef } from "./prefabTypes";
export { registerInspectorFieldRenderer, type FieldRenderer, type FieldRendererProps } from "./components/InspectorPane";
export type { PropValueType, PropInfo, PropGroup } from "./components/objectInspector";
export { introspectObject, introspectMaterial, introspectGeometry } from "./components/objectInspector";
