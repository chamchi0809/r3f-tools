import { TransformControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three/webgpu";
import {
  makeObject,
  buildMaterial,
  buildGeometry,
  applySerializedObject,
  useSceneStore,
  type SerializedObject,
} from "../store/sceneStore";
import { ClickSelector } from "./ClickSelector";

type TransformMode = "translate" | "rotate" | "scale";

function makeDeserializedObject(node: SerializedObject): THREE.Object3D {
  const obj = makeObject(node.kind);
  obj.name = node.name;
  obj.position.set(...node.position);
  obj.rotation.set(...node.rotation);
  obj.scale.set(...node.scale);
  if (obj instanceof THREE.Mesh) {
    if (node.geometry) obj.geometry = buildGeometry(node.geometry);
    if (node.material) obj.material = buildMaterial(node.material);
  }
  applySerializedObject(obj, node);
  return obj;
}

function addDeserializedSubtree(
  scene: THREE.Scene,
  serialized: SerializedObject,
  parentObj: THREE.Object3D | THREE.Scene,
  parentUUID: string | null,
): void {
  const obj = makeDeserializedObject(serialized);
  parentObj.add(obj);
  useSceneStore.getState().registerObject(obj, serialized.kind, parentUUID);
  for (const child of serialized.children) {
    addDeserializedSubtree(scene, child, obj, obj.uuid);
  }
}

export function SceneContent({
  onTransformDrag,
  transformDragging,
  transformMode,
}: {
  onTransformDrag: (dragging: boolean) => void;
  transformDragging: boolean;
  transformMode: TransformMode;
}): React.JSX.Element {
  const { scene } = useThree();
  const pendingAdd = useSceneStore((s) => s.pendingAdd);
  const pendingRemove = useSceneStore((s) => s.pendingRemove);
  const pendingDeserialize = useSceneStore((s) => s.pendingDeserialize);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);

  useFrame(() => {});
  useFrame(() => {});

  useEffect(() => {
    if (!pendingAdd) return;
    useSceneStore.getState().clearPendingAdd();
    const { kind, parentUUID } = pendingAdd;
    const obj = makeObject(kind);
    const parent = parentUUID
      ? (useSceneStore.getState().objects.get(parentUUID) ?? scene)
      : scene;
    parent.add(obj);
    useSceneStore.getState().registerObject(obj, kind, parentUUID);
  }, [pendingAdd, scene]);

  useEffect(() => {
    if (!pendingRemove) return;
    useSceneStore.getState().clearPendingRemove();

    const removeRecursive = (uuid: string) => {
      const state = useSceneStore.getState();
      const node = state.nodes.get(uuid);
      const obj = state.objects.get(uuid);
      if (node) {
        for (const childUUID of [...node.childUUIDs]) {
          removeRecursive(childUUID);
        }
      }
      if (obj) obj.parent?.remove(obj);
      state.unregisterObject(uuid);
    };

    removeRecursive(pendingRemove);
  }, [pendingRemove]);

  useEffect(() => {
    if (!pendingDeserialize) return;
    useSceneStore.getState().clearPendingDeserialize();

    const state = useSceneStore.getState();
    for (const uuid of [...state.rootUUIDs]) {
      const obj = state.objects.get(uuid);
      if (obj) scene.remove(obj);
    }
    useSceneStore.setState({
      rootUUIDs: [],
      nodes: new Map(),
      objects: new Map(),
      selectedUUID: null,
    });

    for (const serialized of pendingDeserialize) {
      addDeserializedSubtree(scene, serialized, scene, null);
    }
  }, [pendingDeserialize, scene]);

  const selectedObj = selectedUUID
    ? (useSceneStore.getState().objects.get(selectedUUID) ?? null)
    : null;

  return (
    <>
      <ClickSelector transformDragging={transformDragging} />
      {selectedObj && (
        <TransformControls
          object={selectedObj}
          mode={transformMode}
          onMouseDown={() => onTransformDrag(true)}
          onMouseUp={() => {
            onTransformDrag(false);
            useSceneStore.getState().invalidate();
          }}
        />
      )}
    </>
  );
}
