import { create, type StoreApi } from "zustand";
import { type UseBoundStore } from "zustand/react";
import * as THREE from "three/webgpu";

export type ObjectKind =
  | "mesh"
  | "group"
  | "ambientLight"
  | "directionalLight"
  | "pointLight"
  | "perspectiveCamera";

export interface SerializedMaterial {
  type: "MeshStandardMaterial" | "MeshBasicMaterial";
  color: string;
  roughness?: number;
  metalness?: number;
}

export interface SerializedObject {
  uuid: string;
  name: string;
  kind: ObjectKind;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  material?: SerializedMaterial;
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
  serialize: () => SerializedObject[];
  deserialize: (nodes: SerializedObject[]) => void;
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
  }
}

function detectKind(obj: THREE.Object3D): ObjectKind {
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
    children: (nodes.get(obj.uuid)?.childUUIDs ?? [])
      .map((childUUID) => {
        const childObj = objects.get(childUUID);
        return childObj ? serializeObject(childObj, nodes, objects) : null;
      })
      .filter(Boolean) as SerializedObject[],
  };
  if (obj instanceof THREE.Mesh) {
    const mat = obj.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
    node.material = {
      type:
        mat instanceof THREE.MeshStandardMaterial ? "MeshStandardMaterial" : "MeshBasicMaterial",
      color: `#${mat.color.getHexString()}`,
      roughness: mat instanceof THREE.MeshStandardMaterial ? mat.roughness : undefined,
      metalness: mat instanceof THREE.MeshStandardMaterial ? mat.metalness : undefined,
    };
  }
  return node;
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
  serialize: () => SerializedObject[];
  deserialize: (nodes: SerializedObject[]) => void;
  invalidate: () => void;
} = {
  addObject: (kind, parentUUID) => useSceneStore.getState().addObject(kind, parentUUID),
  removeObject: (uuid) => useSceneStore.getState().removeObject(uuid),
  select: (uuid) => useSceneStore.getState().select(uuid),
  setTransform: (uuid, position, rotation, scale) =>
    useSceneStore.getState().setTransform(uuid, position, rotation, scale),
  setMaterialColor: (uuid, color) => useSceneStore.getState().setMaterialColor(uuid, color),
  serialize: () => useSceneStore.getState().serialize(),
  deserialize: (nodes) => useSceneStore.getState().deserialize(nodes),
  invalidate: () => useSceneStore.getState().invalidate(),
};
