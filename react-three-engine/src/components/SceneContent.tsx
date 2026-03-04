import { Html, TransformControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import {
  makeObject,
  buildMaterial,
  buildGeometry,
  applySerializedObject,
  useSceneStore,
  type SerializedObject,
} from "../store/sceneStore";
import { historyActions } from "../store/historyStore";
import { SetTransformCommand } from "../store/commands";
import { useSettingsStore, resolveSnapProps } from "../store/settingsStore";
import { useTagStore } from "../store/tagStore";
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

function SelectionOutline({ selectedObj }: { selectedObj: THREE.Mesh }) {
  const lineRef = useRef<THREE.LineSegments | null>(null);

  useEffect(() => {
    // Build EdgesGeometry from the mesh's current geometry.
    const edgesGeo = new THREE.EdgesGeometry(selectedObj.geometry, 1);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x44aaff });
    const line = new THREE.LineSegments(edgesGeo, lineMat);
    line.name = "__selectionOutline";
    // Disable raycasting so the outline never intercepts click/selection events.
    line.raycast = () => {};
    // Imperatively parent it so it inherits the mesh's transform exactly.
    selectedObj.add(line);
    lineRef.current = line;

    return () => {
      selectedObj.remove(line);
      edgesGeo.dispose();
      lineMat.dispose();
      lineRef.current = null;
    };
  }, [selectedObj, selectedObj.geometry]);

  return null;
}

// ─── Tag gizmos ───────────────────────────────────────────────────────────────

const _worldPos = new THREE.Vector3();

function TagGizmoLabel({ obj, tags }: { obj: THREE.Object3D; tags: Set<string> }) {
  const groupRef = useRef<THREE.Group>(null);

  // Compute label offset above the object once.
  const yOffset = useMemo(() => {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    return Math.max(size.y * 0.5 + 0.15, 0.45);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj]);

  // Track the object's world position every frame.
  useFrame(() => {
    if (!groupRef.current) return;
    obj.getWorldPosition(_worldPos);
    groupRef.current.position.copy(_worldPos);
  });

  return (
    <group ref={groupRef}>
      <Html
        position={[0, yOffset, 0]}
        center
        zIndexRange={[10, 11]}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          {Array.from(tags).map((t) => (
            <span
              key={t}
              style={{
                fontSize: 9,
                padding: "1px 6px",
                borderRadius: 3,
                background: "rgba(20,48,35,0.88)",
                border: "1px solid #2a5a40",
                color: "#80e0a0",
                lineHeight: 1.6,
                whiteSpace: "nowrap",
                backdropFilter: "blur(2px)",
              }}
            >
              #{t}
            </span>
          ))}
        </div>
      </Html>
    </group>
  );
}

function TagGizmos() {
  const objectTags = useTagStore((s) => s.objectTags);
  const objects = useSceneStore((s) => s.objects);

  const entries = useMemo(() => {
    const result: { obj: THREE.Object3D; tags: Set<string> }[] = [];
    for (const [uuid, tags] of objectTags) {
      if (tags.size === 0) continue;
      const obj = objects.get(uuid);
      if (!obj) continue;
      result.push({ obj, tags });
    }
    return result;
  }, [objectTags, objects]);

  return (
    <>
      {entries.map(({ obj, tags }) => (
        <TagGizmoLabel key={obj.uuid} obj={obj} tags={tags} />
      ))}
    </>
  );
}

export function SceneContent({
  onTransformDrag,
  transformDragging,
  transformMode,
  isModeling,
}: {
  onTransformDrag: (dragging: boolean) => void;
  transformDragging: boolean;
  transformMode: TransformMode;
  isModeling: boolean;
}): React.JSX.Element {
  const { scene } = useThree();
  const snap = useSettingsStore((s) => s.snap);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const pendingAdd = useSceneStore((s) => s.pendingAdd);
  const pendingRemove = useSceneStore((s) => s.pendingRemove);
  const pendingDeserialize = useSceneStore((s) => s.pendingDeserialize);
  const pendingGltf = useSceneStore((s) => s.pendingGltf);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);

  useFrame(() => {});
  useFrame(() => {});

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Control") setCtrlHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Control") setCtrlHeld(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    if (!pendingAdd) return;
    useSceneStore.getState().clearPendingAdd();
    const { kind, parentUUID, geometry, position } = pendingAdd;
    const obj = makeObject(kind);
    if (geometry && obj instanceof THREE.Mesh) {
      obj.geometry = geometry;
    }
    if (position) {
      obj.position.copy(position);
    }
    const parent = parentUUID ? (useSceneStore.getState().objects.get(parentUUID) ?? scene) : scene;
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

  useEffect(() => {
    if (!pendingGltf) return;
    useSceneStore.getState().clearPendingGltf();
    // Recursively register all GLTF scene objects into the store.
    const registerGltfSubtree = (
      obj: THREE.Object3D,
      parentUUID: string | null,
    ) => {
      if (!obj.name) obj.name = obj.type;
      // Detect kind for registration
      let kind: import("../store/sceneStore").ObjectKind = "group";
      if (obj instanceof THREE.Mesh) kind = "mesh";
      else if (obj instanceof THREE.AmbientLight) kind = "ambientLight";
      else if (obj instanceof THREE.DirectionalLight) kind = "directionalLight";
      else if (obj instanceof THREE.PointLight) kind = "pointLight";
      else if (obj instanceof THREE.PerspectiveCamera) kind = "perspectiveCamera";
      useSceneStore.getState().registerObject(obj, kind, parentUUID);
      for (const child of obj.children) {
        registerGltfSubtree(child, obj.uuid);
      }
    };
    scene.add(pendingGltf);
    registerGltfSubtree(pendingGltf, null);
  }, [pendingGltf, scene]);

  const selectedObj = selectedUUID
    ? (useSceneStore.getState().objects.get(selectedUUID) ?? null)
    : null;

  // Capture transform snapshot before a drag begins so we can record an undo step.
  const transformStartRef = useRef<{
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  } | null>(null);

  return (
    <>
      {!isModeling && <ClickSelector transformDragging={transformDragging} />}
      {selectedObj && !isModeling && (
        <TransformControls
          object={selectedObj}
          mode={transformMode}
          {...resolveSnapProps(snap, ctrlHeld)}
          onMouseDown={() => {
            // Snapshot transform before drag
            transformStartRef.current = {
              position: selectedObj.position.toArray() as [number, number, number],
              rotation: [selectedObj.rotation.x, selectedObj.rotation.y, selectedObj.rotation.z],
              scale: selectedObj.scale.toArray() as [number, number, number],
            };
            onTransformDrag(true);
          }}
          onMouseUp={() => {
            onTransformDrag(false);
            // Record undo step: only if transform actually changed
            const start = transformStartRef.current;
            transformStartRef.current = null;
            if (start && selectedUUID) {
              const after = {
                position: selectedObj.position.toArray() as [number, number, number],
                rotation: [selectedObj.rotation.x, selectedObj.rotation.y, selectedObj.rotation.z] as [number, number, number],
                scale: selectedObj.scale.toArray() as [number, number, number],
              };
              const moved =
                start.position.some((v, i) => v !== after.position[i]) ||
                start.rotation.some((v, i) => v !== after.rotation[i]) ||
                start.scale.some((v, i) => v !== after.scale[i]);
              if (moved) {
                // Build and execute command with correct before/after (object is
                // already at the "after" position — execute() is a no-op here,
                // but undo() will correctly restore the pre-drag state).
                const cmd = new SetTransformCommand(
                  selectedUUID,
                  start,
                  after,
                );
                // execute() would re-apply the transform (redundant but harmless)
                // We bypass it and just push to the undo stack manually via a
                // thin wrapper that skips re-application.
                historyActions.executeCommand({
                  label: cmd.label,
                  mergeKey: undefined, // drag end is never merged
                  execute() {
                    // TransformControls already applied it; just mark dirty.
                    useSceneStore.getState().invalidate();
                  },
                  undo() { cmd.undo(); },
                });
              } else {
                useSceneStore.getState().invalidate();
              }
            } else {
              useSceneStore.getState().invalidate();
            }
          }}
        />
      )}
      {selectedObj instanceof THREE.Mesh && !isModeling && (
        <SelectionOutline selectedObj={selectedObj} />
      )}
      <TagGizmos />
    </>
  );
}
