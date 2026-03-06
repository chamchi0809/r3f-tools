import * as THREE from "three/webgpu";
import { create, type StoreApi } from "zustand";
import { type UseBoundStore } from "zustand/react";
import {
  buildMaterial,
  buildGeometry,
  readMaterialProps,
  readGeometryParams,
  applyLightProps,
  applyCameraProps,
  DEFAULT_GEOMETRY_PARAMS,
  type MaterialType,
  type TextureMapSlot,
  type GeometryType,
  type GeometryParams,
  type MaterialPatch,
  type GeometryPatch,
  type LightPatch,
  type CameraPatch,
} from "./serializationCore";
import type { ObjectKind, SceneNode, SerializedObject } from "./sceneTypes";
import { serializeObject } from "./sceneSerialization";
import { tagActions } from "./tagStore";

export interface SceneState {
  rootUUIDs: string[];
  nodes: Map<string, SceneNode>;
  objects: Map<string, THREE.Object3D>;
  selectedUUID: string | null;
  version: number;
  pendingAdd: {
    kind: ObjectKind;
    parentUUID: string | null;
    geometry?: THREE.BufferGeometry;
    position?: THREE.Vector3;
  } | null;
  pendingRemove: string | null;
  pendingDeserialize: SerializedObject[] | null;
  pendingGltf: THREE.Object3D | null;
  invalidate: () => void;
  select: (uuid: string | null) => void;
  addObject: (kind: ObjectKind, parentUUID?: string | null) => void;
  addMeshWithGeometry: (
    geo: THREE.BufferGeometry,
    position?: THREE.Vector3,
    parentUUID?: string | null,
  ) => void;
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
  setMaterialProps: (uuid: string, props: MaterialPatch) => void;
  setTextureMap: (uuid: string, slot: TextureMapSlot, url: string | null) => void;
  setGeometryType: (uuid: string, type: GeometryType) => void;
  setGeometryParams: (uuid: string, params: GeometryPatch) => void;
  serialize: () => SerializedObject[];
  deserialize: (nodes: SerializedObject[]) => void;
  setLightProps: (uuid: string, props: LightPatch) => void;
  setCameraProps: (uuid: string, props: CameraPatch) => void;
  addGltf: (root: THREE.Object3D) => void;
  clearPendingGltf: () => void;
}

export const useSceneStore: UseBoundStore<StoreApi<SceneState>> = create<SceneState>((set, get) => ({
  rootUUIDs: [],
  nodes: new Map(),
  objects: new Map(),
  selectedUUID: null,
  version: 0,
  pendingAdd: null,
  pendingRemove: null,
  pendingDeserialize: null,
  pendingGltf: null,

  invalidate: () => set((s) => ({ version: s.version + 1 })),

  select: (uuid) => set({ selectedUUID: uuid }),

  addObject: (kind, parentUUID = null) => {
    set({ pendingAdd: { kind, parentUUID: parentUUID ?? null } });
  },

  addMeshWithGeometry: (geo, position?, parentUUID = null) => {
    set({
      pendingAdd: { kind: "mesh", parentUUID: parentUUID ?? null, geometry: geo, position },
    });
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
      tagActions.clearObjectTags(uuid);
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
    applyLightProps(obj, props);
    invalidate();
  },

  setCameraProps: (uuid, props) => {
    const { objects, invalidate } = get();
    const obj = objects.get(uuid);
    if (!(obj instanceof THREE.PerspectiveCamera)) return;
    applyCameraProps(obj, props);
    invalidate();
  },

  addGltf: (root) => {
    set({ pendingGltf: root });
  },

  clearPendingGltf: () => set({ pendingGltf: null }),
}));
