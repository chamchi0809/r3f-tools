import * as THREE from "three/webgpu";
import { tagActions, useTagStore } from "./tagStore";
import { applySerializedObjectState, snapshotSerializedSubtree } from "./serializationCore";
import { detectKind } from "./objectFactory";
import type { SceneNode, SerializedObject } from "./sceneTypes";

export function serializeObject(
  obj: THREE.Object3D,
  nodes: Map<string, SceneNode>,
  objects: Map<string, THREE.Object3D>,
): SerializedObject {
  const snapshot = snapshotSerializedSubtree(
    obj.uuid,
    (uuid) => {
      const node = nodes.get(uuid);
      if (!node) return undefined;
      return { kind: node.kind, childUUIDs: node.childUUIDs };
    },
    (uuid) => objects.get(uuid),
    (uuid) => {
      const tagSet = useTagStore.getState().objectTags.get(uuid);
      return tagSet ? Array.from(tagSet) : undefined;
    },
  );
  if (!snapshot) throw new Error(`Failed to serialize object subtree for ${obj.uuid}`);
  snapshot.kind = detectKind(obj);
  return snapshot;
}

export function applySerializedObject(obj: THREE.Object3D, node: SerializedObject): void {
  applySerializedObjectState(obj, node);
  if (node.tags && node.tags.length > 0) {
    tagActions.setObjectTags(obj.uuid, node.tags);
  }
}
