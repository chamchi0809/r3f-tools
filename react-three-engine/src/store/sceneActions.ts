import * as THREE from "three/webgpu";
import {
  readMaterialProps,
  readGeometryParams,
  readLightProps,
  readCameraProps,
  vec3ToTuple,
  type MaterialType,
  type TextureMapSlot,
  type GeometryType,
  type MaterialPatch,
  type GeometryPatch,
  type LightPatch,
  type CameraPatch,
} from "./serializationCore";
import { useSceneStore } from "./sceneStoreState";
import type { ObjectKind, SerializedObject } from "./sceneTypes";

function history() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("./historyStore") as typeof import("./historyStore")).historyActions;
}

function commands() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./commands") as typeof import("./commands");
}

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
  setMaterialProps: (uuid: string, props: MaterialPatch) => void;
  setTextureMap: (uuid: string, slot: TextureMapSlot, url: string | null) => void;
  setGeometryType: (uuid: string, type: GeometryType) => void;
  setGeometryParams: (uuid: string, params: GeometryPatch) => void;
  renameObject: (uuid: string, name: string) => void;
  serialize: () => SerializedObject[];
  deserialize: (nodes: SerializedObject[]) => void;
  setLightProps: (uuid: string, props: LightPatch) => void;
  setCameraProps: (uuid: string, props: CameraPatch) => void;
  invalidate: () => void;
  addMeshWithGeometry: (
    geo: THREE.BufferGeometry,
    position?: THREE.Vector3,
    parentUUID?: string | null,
  ) => void;
  duplicateObject: (uuid: string) => void;
  addGltf: (root: THREE.Object3D) => void;
} = {
  addObject: (kind, parentUUID) => {
    const cmd = new (commands().AddObjectCommand)(kind, parentUUID ?? null);
    history().executeCommand(cmd);
  },

  addMeshWithGeometry: (geo, position, parentUUID) => {
    const cmd = new (commands().AddMeshWithGeometryCommand)(geo, position, parentUUID ?? null);
    history().executeCommand(cmd);
  },

  removeObject: (uuid) => {
    const state = useSceneStore.getState();
    const name = state.nodes.get(uuid)?.name ?? state.objects.get(uuid)?.name ?? uuid;
    const cmd = new (commands().RemoveObjectCommand)(uuid, name);
    history().executeCommand(cmd);
  },

  select: (uuid) => useSceneStore.getState().select(uuid),

  setTransform: (uuid, position, rotation, scale) => {
    const obj = useSceneStore.getState().objects.get(uuid);
    if (!obj) return;
    const before = {
      position: vec3ToTuple(obj.position),
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z] as [number, number, number],
      scale: vec3ToTuple(obj.scale),
    };
    const cmd = new (commands().SetTransformCommand)(uuid, before, { position, rotation, scale });
    history().executeCommand(cmd);
  },

  setMaterialColor: (uuid, color) => {
    const obj = useSceneStore.getState().objects.get(uuid);
    if (!(obj instanceof THREE.Mesh)) return;
    const before = `#${(obj.material as THREE.MeshStandardMaterial).color.getHexString()}`;
    const cmd = new (commands().SetMaterialColorCommand)(uuid, before, color);
    history().executeCommand(cmd);
  },

  setMaterialType: (uuid, type) => {
    const obj = useSceneStore.getState().objects.get(uuid);
    if (!(obj instanceof THREE.Mesh)) return;
    const beforeFull = readMaterialProps(obj.material as THREE.Material);
    const cmd = new (commands().SetMaterialTypeCommand)(uuid, beforeFull.type, type, beforeFull);
    history().executeCommand(cmd);
  },

  setMaterialProps: (uuid, props) => {
    const obj = useSceneStore.getState().objects.get(uuid);
    if (!(obj instanceof THREE.Mesh)) return;
    const before = readMaterialProps(obj.material as THREE.Material);
    const cmd = new (commands().SetMaterialPropsCommand)(uuid, before, props);
    history().executeCommand(cmd);
  },

  setTextureMap: (uuid, slot, url) => {
    const obj = useSceneStore.getState().objects.get(uuid);
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = readMaterialProps(obj.material as THREE.Material);
    const before = mat.maps?.[slot] ?? null;
    const cmd = new (commands().SetTextureMapCommand)(uuid, slot, before, url);
    history().executeCommand(cmd);
  },

  setGeometryType: (uuid, type) => {
    const obj = useSceneStore.getState().objects.get(uuid);
    if (!(obj instanceof THREE.Mesh)) return;
    const before = readGeometryParams(obj.geometry);
    const cmd = new (commands().SetGeometryTypeCommand)(uuid, before, type);
    history().executeCommand(cmd);
  },

  setGeometryParams: (uuid, params) => {
    const obj = useSceneStore.getState().objects.get(uuid);
    if (!(obj instanceof THREE.Mesh)) return;
    const before = readGeometryParams(obj.geometry);
    const cmd = new (commands().SetGeometryParamsCommand)(uuid, before, params);
    history().executeCommand(cmd);
  },

  renameObject: (uuid, name) => {
    const obj = useSceneStore.getState().objects.get(uuid);
    if (!obj) return;
    const before = obj.name;
    const cmd = new (commands().RenameObjectCommand)(uuid, before, name);
    history().executeCommand(cmd);
  },

  serialize: () => useSceneStore.getState().serialize(),
  deserialize: (nodes) => {
    useSceneStore.getState().deserialize(nodes);
    history().clear();
  },

  setLightProps: (uuid, props) => {
    const obj = useSceneStore.getState().objects.get(uuid);
    if (!(obj instanceof THREE.Light)) return;
    const before = readLightProps(obj);
    const cmd = new (commands().SetLightPropsCommand)(uuid, before, props);
    history().executeCommand(cmd);
  },

  setCameraProps: (uuid, props) => {
    const obj = useSceneStore.getState().objects.get(uuid);
    if (!(obj instanceof THREE.PerspectiveCamera)) return;
    const before = readCameraProps(obj);
    const cmd = new (commands().SetCameraPropsCommand)(uuid, before, props);
    history().executeCommand(cmd);
  },

  invalidate: () => useSceneStore.getState().invalidate(),

  duplicateObject: (uuid) => {
    const cmd = new (commands().DuplicateObjectCommand)(uuid);
    history().executeCommand(cmd);
  },

  addGltf: (root) => {
    const cmd = new (commands().AddGltfCommand)(root);
    history().executeCommand(cmd);
  },
};
