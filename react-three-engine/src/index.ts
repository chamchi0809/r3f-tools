import * as THREE from "three";

export { THREE };
export const version = "0.0.1";
export { reactThreeEnginePlugin } from "./vitePlugin";
export { default as App } from "./App";
export { prefabRegistry, type ScenePrefab } from "./prefabs/registry";
export { useSceneStore, sceneActions } from "./store";
export type { ObjectKind, SerializedMaterial, SerializedObject } from "./store";
