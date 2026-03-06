/**
 * commands.ts
 *
 * Concrete SceneCommand implementations for every undoable editor action.
 *
 * Each command:
 * - Stores only the delta (before/after values), NOT the whole scene.
 * - Calls raw store methods directly (not via sceneActions to avoid circular deps).
 * - Is fully reversible via undo().
 *
 * Commands that involve add/remove use SerializedObject snapshots of the
 * affected subtree only — this is still orders of magnitude cheaper than
 * snapshotting the entire scene.
 */

import * as THREE from "three/webgpu";
import type { SceneCommand } from "./historyStore";
import {
  useSceneStore,
  makeObject,
  readMaterialProps,
  readGeometryParams,
  readLightProps,
  readCameraProps,
  type ObjectKind,
  type SerializedObject,
  type MaterialType,
  type GeometryType,
  type GeometryParams,
  type GeometryPatch,
  type SerializedMaterial,
  type MaterialPatch,
  type LightProps,
  type LightPatch,
  type CameraProps,
  type CameraPatch,
  type TextureMapSlot,
} from "./sceneStore";
import { useTagStore } from "./tagStore";
import {
  materializeSerializedSubtree,
  snapshotSerializedSubtree,
  buildRawBufferGeometry,
  applyRawBufferGeometry,
  snapshotRawBufferGeometry,
  type GeometryBufferSnapshot,
} from "./serializationCore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Snapshot the full subtree of an object into a SerializedObject tree. */
function snapshotSubtree(uuid: string): SerializedObject | null {
  const state = useSceneStore.getState();
  return snapshotSerializedSubtree(
    uuid,
    (nodeUUID) => {
      const node = state.nodes.get(nodeUUID);
      if (!node) return undefined;
      return { kind: node.kind, childUUIDs: node.childUUIDs };
    },
    (objectUUID) => state.objects.get(objectUUID),
    (objectUUID) => {
      const tags = useTagStore.getState().objectTags.get(objectUUID);
      return tags ? Array.from(tags) : undefined;
    },
  );
}

/**
 * Restore a previously-removed subtree back into the scene.
 * Walks the THREE scene to re-parent correctly.
 */
function restoreSubtree(
  snap: SerializedObject,
  parentUUID: string | null,
): void {
  const state = useSceneStore.getState();

  // Find the THREE parent — either a registered object or the scene root.
  // We cannot access the R3F scene directly here, so we piggyback on
  // pendingDeserialize for add-back, OR we re-use the existing parent object
  // when it's already registered (the common case for undo after remove).
  const parentObj = parentUUID ? state.objects.get(parentUUID) : null;
  if (parentUUID && !parentObj) {
    // Parent no longer exists — fall back to scene-level add via pendingAdd.
    // This is an edge case (parent was also deleted); we lose nesting but
    // don't hard-fail.
    useSceneStore.getState().addObject(snap.kind, null);
    return;
  }

  const obj = materializeSerializedSubtree(snap, (kind) => makeObject(kind));

  if (parentObj) {
    parentObj.add(obj);
  } else {
    // Attach to the scene root.  We need the THREE.Scene reference.
    // The cleanest way is to use pendingAdd but we need the obj already built.
    // Instead, walk the objects map to find a root-level object and grab its parent.
    const rootUUIDs = state.rootUUIDs;
    if (rootUUIDs.length > 0) {
      const firstRoot = state.objects.get(rootUUIDs[0]);
      if (firstRoot?.parent) {
        firstRoot.parent.add(obj);
      }
    }
  }

  useSceneStore.getState().registerObject(obj, snap.kind, parentUUID);

  for (const child of snap.children) {
    registerRestoredSubtree(child, obj.uuid);
  }
}

function registerRestoredSubtree(snap: SerializedObject, parentUUID: string | null): void {
  const obj = useSceneStore.getState().objects.get(snap.uuid);
  if (!obj) return;
  useSceneStore.getState().registerObject(obj, snap.kind, parentUUID);
  for (const child of snap.children) {
    registerRestoredSubtree(child, obj.uuid);
  }
}

/** Remove a subtree from the THREE scene and the store without using pendingRemove. */
function removeSubtreeImmediate(uuid: string): void {
  const state = useSceneStore.getState();
  const node = state.nodes.get(uuid);
  if (!node) return;
  // depth-first: remove children first
  for (const childUUID of [...(node.childUUIDs ?? [])]) {
    removeSubtreeImmediate(childUUID);
  }
  const obj = state.objects.get(uuid);
  if (obj) obj.parent?.remove(obj);
  useSceneStore.getState().unregisterObject(uuid);
}

// ─── AddObjectCommand ─────────────────────────────────────────────────────────

export class AddObjectCommand implements SceneCommand {
  readonly label: string;
  private uuid: string | null = null;

  constructor(
    private readonly kind: ObjectKind,
    private readonly parentUUID: string | null = null,
  ) {
    this.label = `Add ${kind}`;
  }

  execute(): void {
    if (this.uuid) {
      // Re-do: restore the previously-created object
      const state = useSceneStore.getState();
      // If it was already re-added (e.g. double redo) do nothing
      if (state.objects.has(this.uuid)) return;
    }
    // Trigger the normal add flow — SceneContent will pick up pendingAdd.
    useSceneStore.getState().addObject(this.kind, this.parentUUID);
    // We can't know the UUID synchronously because registerObject is called
    // asynchronously in a React effect. We track it via a subscription below.
    this._subscribeNextRegister();
  }

  undo(): void {
    if (!this.uuid) return;
    removeSubtreeImmediate(this.uuid);
  }

  private _subscribeNextRegister(): void {
    // Grab the current set of registered UUIDs before the add resolves.
    const before = new Set(useSceneStore.getState().objects.keys());
    const unsub = useSceneStore.subscribe((state) => {
      for (const uuid of state.objects.keys()) {
        if (!before.has(uuid)) {
          this.uuid = uuid;
          unsub();
          return;
        }
      }
    });
  }
}

// ─── RemoveObjectCommand ──────────────────────────────────────────────────────

export class RemoveObjectCommand implements SceneCommand {
  readonly label: string;
  private snapshot: SerializedObject | null = null;
  private parentUUID: string | null = null;

  constructor(private readonly uuid: string, objectName: string) {
    this.label = `Remove ${objectName}`;
  }

  execute(): void {
    // Capture state before removal
    this.snapshot = snapshotSubtree(this.uuid);
    this.parentUUID = useSceneStore.getState().nodes.get(this.uuid)?.parentUUID ?? null;
    removeSubtreeImmediate(this.uuid);
  }

  undo(): void {
    if (!this.snapshot) return;
    restoreSubtree(this.snapshot, this.parentUUID);
  }
}

// ─── SetTransformCommand ──────────────────────────────────────────────────────

export class SetTransformCommand implements SceneCommand {
  readonly label = "Set Transform";
  readonly mergeKey: string;

  constructor(
    private readonly uuid: string,
    private readonly before: {
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
    },
    private readonly after: {
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
    },
  ) {
    this.mergeKey = `SetTransform:${uuid}`;
  }

  execute(): void {
    useSceneStore
      .getState()
      .setTransform(this.uuid, this.after.position, this.after.rotation, this.after.scale);
  }

  undo(): void {
    useSceneStore
      .getState()
      .setTransform(this.uuid, this.before.position, this.before.rotation, this.before.scale);
  }
}

// ─── SetMaterialColorCommand ──────────────────────────────────────────────────

export class SetMaterialColorCommand implements SceneCommand {
  readonly label = "Set Material Color";
  readonly mergeKey: string;

  constructor(
    private readonly uuid: string,
    private readonly before: string,
    private readonly after: string,
  ) {
    this.mergeKey = `SetMaterialColor:${uuid}`;
  }

  execute(): void {
    useSceneStore.getState().setMaterialColor(this.uuid, this.after);
  }

  undo(): void {
    useSceneStore.getState().setMaterialColor(this.uuid, this.before);
  }
}

// ─── SetMaterialTypeCommand ───────────────────────────────────────────────────

export class SetMaterialTypeCommand implements SceneCommand {
  readonly label: string;

  constructor(
    private readonly uuid: string,
    private readonly before: MaterialType,
    private readonly after: MaterialType,
    private readonly beforeFull: SerializedMaterial,
  ) {
    this.label = `Change Material → ${after}`;
  }

  execute(): void {
    useSceneStore.getState().setMaterialType(this.uuid, this.after);
  }

  undo(): void {
    // Restore the entire previous material (type + props) via setMaterialProps
    // which rebuilds from a full serialized descriptor.
    useSceneStore.getState().setMaterialProps(this.uuid, this.beforeFull);
  }
}

// ─── SetMaterialPropsCommand ──────────────────────────────────────────────────

export class SetMaterialPropsCommand implements SceneCommand {
  readonly label = "Edit Material";
  readonly mergeKey: string;

  constructor(
    private readonly uuid: string,
    private readonly before: SerializedMaterial,
    private readonly after: MaterialPatch,
  ) {
    this.mergeKey = `SetMaterialProps:${uuid}`;
  }

  execute(): void {
    useSceneStore.getState().setMaterialProps(this.uuid, this.after);
  }

  undo(): void {
    useSceneStore.getState().setMaterialProps(this.uuid, this.before);
  }
}

// ─── SetTextureMapCommand ─────────────────────────────────────────────────────

export class SetTextureMapCommand implements SceneCommand {
  readonly label: string;

  constructor(
    private readonly uuid: string,
    private readonly slot: TextureMapSlot,
    private readonly before: string | null,
    private readonly after: string | null,
  ) {
    this.label = `Set Texture (${slot})`;
  }

  execute(): void {
    useSceneStore.getState().setTextureMap(this.uuid, this.slot, this.after);
  }

  undo(): void {
    useSceneStore.getState().setTextureMap(this.uuid, this.slot, this.before);
  }
}

// ─── SetGeometryTypeCommand ───────────────────────────────────────────────────

export class SetGeometryTypeCommand implements SceneCommand {
  readonly label: string;

  constructor(
    private readonly uuid: string,
    private readonly before: GeometryParams,
    private readonly after: GeometryType,
  ) {
    this.label = `Change Geometry → ${after.replace("Geometry", "")}`;
  }

  execute(): void {
    useSceneStore.getState().setGeometryType(this.uuid, this.after);
  }

  undo(): void {
    // Restore the exact previous geometry params
    useSceneStore.getState().setGeometryParams(this.uuid, this.before);
  }
}

// ─── SetGeometryParamsCommand ─────────────────────────────────────────────────

export class SetGeometryParamsCommand implements SceneCommand {
  readonly label = "Edit Geometry";
  readonly mergeKey: string;

  constructor(
    private readonly uuid: string,
    private readonly before: GeometryParams,
    private readonly after: GeometryPatch,
  ) {
    this.mergeKey = `SetGeometryParams:${uuid}`;
  }

  execute(): void {
    useSceneStore.getState().setGeometryParams(this.uuid, this.after);
  }

  undo(): void {
    useSceneStore.getState().setGeometryParams(this.uuid, this.before);
  }
}

// ─── SetLightPropsCommand ─────────────────────────────────────────────────────

export class SetLightPropsCommand implements SceneCommand {
  readonly label = "Edit Light";
  readonly mergeKey: string;

  constructor(
    private readonly uuid: string,
    private readonly before: LightProps,
    private readonly after: LightPatch,
  ) {
    this.mergeKey = `SetLightProps:${uuid}`;
  }

  execute(): void {
    useSceneStore.getState().setLightProps(this.uuid, this.after);
  }

  undo(): void {
    useSceneStore.getState().setLightProps(this.uuid, this.before);
  }
}

// ─── SetCameraPropsCommand ────────────────────────────────────────────────────

export class SetCameraPropsCommand implements SceneCommand {
  readonly label = "Edit Camera";
  readonly mergeKey: string;

  constructor(
    private readonly uuid: string,
    private readonly before: CameraProps,
    private readonly after: CameraPatch,
  ) {
    this.mergeKey = `SetCameraProps:${uuid}`;
  }

  execute(): void {
    useSceneStore.getState().setCameraProps(this.uuid, this.after);
  }

  undo(): void {
    useSceneStore.getState().setCameraProps(this.uuid, this.before);
  }
}

// ─── RenameObjectCommand ──────────────────────────────────────────────────────

export class RenameObjectCommand implements SceneCommand {
  readonly label: string;
  readonly mergeKey: string;

  constructor(
    private readonly uuid: string,
    private readonly before: string,
    private readonly after: string,
  ) {
    this.label = `Rename → "${after}"`;
    this.mergeKey = `Rename:${uuid}`;
  }

  execute(): void {
    this._apply(this.after);
  }

  undo(): void {
    this._apply(this.before);
  }

  private _apply(name: string): void {
    const state = useSceneStore.getState();
    const obj = state.objects.get(this.uuid);
    if (!obj) return;
    obj.name = name;
    const node = state.nodes.get(this.uuid);
    if (node) {
      const nodes = new Map(state.nodes);
      nodes.set(this.uuid, { ...node, name });
      useSceneStore.setState({ nodes, version: state.version + 1 });
    } else {
      state.invalidate();
    }
  }
}

// ─── AddMeshWithGeometryCommand ───────────────────────────────────────────────

/**
 * Records a brush-painted mesh add. On undo, removes the mesh.
 * On redo, re-creates it from the stored geometry snapshot.
 *
 * We snapshot the geometry buffer (position + index arrays) so that redo can
 * recreate the exact same mesh without needing the original THREE.BufferGeometry
 * object (which may have been disposed after undo).
 */
export class AddMeshWithGeometryCommand implements SceneCommand {
  readonly label = "Add Mesh (Brush)";
  private uuid: string | null = null;

  // Geometry snapshot stored so execute() / redo can rebuild the mesh.
  private readonly geometrySnapshot: GeometryBufferSnapshot;
  private readonly position: [number, number, number];
  private readonly parentUUID: string | null;

  constructor(
    geo: THREE.BufferGeometry,
    center: THREE.Vector3 | undefined,
    parentUUID: string | null = null,
  ) {
    // Snapshot only — no side effects. The actual add happens in execute().
    const snapshot = snapshotRawBufferGeometry(geo);
    if (!snapshot) throw new Error("Cannot create AddMeshWithGeometryCommand without position data");
    this.geometrySnapshot = snapshot;
    this.position = center ? [center.x, center.y, center.z] : [0, 0, 0];
    this.parentUUID = parentUUID;
  }

  execute(): void {
    if (this.uuid && useSceneStore.getState().objects.has(this.uuid)) {
      // Already present (guard against double-execute).
      return;
    }
    const geo = buildRawBufferGeometry(this.geometrySnapshot);

    const center = new THREE.Vector3(...this.position);
    // Track the new UUID so subsequent undo/redo cycles work.
    const before = new Set(useSceneStore.getState().objects.keys());
    useSceneStore.getState().addMeshWithGeometry(geo, center, this.parentUUID);
    const unsub = useSceneStore.subscribe((state) => {
      for (const uuid of state.objects.keys()) {
        if (!before.has(uuid)) {
          this.uuid = uuid;
          unsub();
          return;
        }
      }
    });
  }

  undo(): void {
    if (!this.uuid) return;
    removeSubtreeImmediate(this.uuid);
    this.uuid = null; // reset so next execute() re-tracks a fresh UUID
  }
}

// ─── GeometryEditCommand ──────────────────────────────────────────────────────

/**
 * Snapshot helper — captures the current position + index buffers of a mesh's
 * geometry so a GeometryEditCommand can store before/after deltas.
 * Call BEFORE the mutation to get `before`, and AFTER to get `after`.
 */
export function snapshotGeometry(uuid: string): { positions: Float32Array; indices: Uint32Array | null } | null {
  const obj = useSceneStore.getState().objects.get(uuid);
  if (!(obj instanceof THREE.Mesh)) return null;
  return snapshotRawBufferGeometry(obj.geometry);
}

/**
 * Records a direct geometry mutation (bevel, extrude, delete elements, add vertex,
 * or vertex drag in modeling mode).
 *
 * Stores only the position + index buffer deltas — not the full scene.
 * apply() replaces the mesh's geometry attributes in-place and recomputes normals/bounds.
 */
export class GeometryEditCommand implements SceneCommand {
  readonly label: string;

  constructor(
    private readonly uuid: string,
    private readonly beforePositions: Float32Array,
    private readonly beforeIndices: Uint32Array | null,
    private readonly afterPositions: Float32Array,
    private readonly afterIndices: Uint32Array | null,
    label: string,
  ) {
    this.label = label;
  }

  execute(): void {
    this._apply(this.afterPositions, this.afterIndices);
  }

  undo(): void {
    this._apply(this.beforePositions, this.beforeIndices);
  }

  private _apply(positions: Float32Array, indices: Uint32Array | null): void {
    const obj = useSceneStore.getState().objects.get(this.uuid);
    if (!(obj instanceof THREE.Mesh)) return;
    applyRawBufferGeometry(obj.geometry, { positions, indices });
    useSceneStore.getState().invalidate();
  }
}

// ─── AddGltfCommand ───────────────────────────────────────────────────────────

export class AddGltfCommand implements SceneCommand {
  readonly label = "Import GLTF";
  private addedRootUUIDs: string[] = [];

  constructor(private readonly gltfRoot: THREE.Object3D) {}

  execute(): void {
    if (this.addedRootUUIDs.length > 0) {
      // Re-do: re-register the previously imported subtree
      // The THREE objects are already in the scene graph from the first execute.
      // This is intentionally not handled for now — GLTF re-add after undo
      // would require re-attaching three objects. We treat it as non-undoable
      // by resetting on undo only.
      return;
    }
    const before = new Set(useSceneStore.getState().rootUUIDs);
    useSceneStore.getState().addGltf(this.gltfRoot);
    // Subscribe to capture the newly-registered root UUIDs.
    const unsub = useSceneStore.subscribe((state) => {
      const newRoots = state.rootUUIDs.filter((id) => !before.has(id));
      if (newRoots.length > 0) {
        this.addedRootUUIDs = newRoots;
        unsub();
      }
    });
  }

  undo(): void {
    for (const uuid of this.addedRootUUIDs) {
      removeSubtreeImmediate(uuid);
    }
    // Also remove from the THREE scene
    this.gltfRoot.parent?.remove(this.gltfRoot);
  }
}
