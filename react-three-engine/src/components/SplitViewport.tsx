import { MapControls, TransformControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { updateOrthoTarget, subscribeOrthoTarget, type OrthoAxis } from "../store/orthoCameraStore";
import * as THREE from "three/webgpu";
import type { TransformMode } from "./Toolbar";
import { ViewportGizmo, ViewportGizmoAnimator } from "./ViewportGizmo";
import { SceneContent } from "./SceneContent";
import { ModelingOverlay } from "./viewport/modeling";
import { BrushOverlay } from "./viewport/brush";
import { WireframeOverlay } from "./viewport/WireframeOverlay";
import { WireframeOnlyMode } from "./viewport/WireframeOnlyMode";
import { OrbitControls } from "@react-three/drei";
import { sceneActions } from "../store/sceneActions";
import { useSceneStore } from "../store/sceneStoreState";
import { useModelingStore, modelingActions, type SelectedElement } from "../store/modelingStore";
import { SetTransformCommand } from "../store/commands";
import { historyActions } from "../store/historyStore";
import { useSettingsStore, resolveSnapProps } from "../store/settingsStore";
import { BoundingBoxGizmo } from "./viewport/modeling/BoundingBoxGizmo";
import { VertexHoverGizmo } from "./viewport/modeling/VertexHoverGizmo";
import { VertexDots } from "./viewport/modeling/VertexDots";
import { EdgeLines } from "./viewport/modeling/EdgeLines";
import { FaceOverlays } from "./viewport/modeling/FaceOverlays";
import { SelectionTransformGizmo } from "./viewport/modeling/SelectionTransformGizmo";
import { findQuadPartner } from "./viewport/modeling/helpers";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  isSplit: boolean;
  onToggleSplit: () => void;
  transformDragging: boolean;
  onTransformDrag: (v: boolean) => void;
  transformMode: TransformMode;
  isModeling: boolean;
  isBrush: boolean;
  perspCameraRef: React.MutableRefObject<THREE.Camera | null>;
  perspControlsRef: React.MutableRefObject<any>;
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  position: "absolute",
  top: 6,
  left: 8,
  color: "#aaa",
  fontFamily: "monospace",
  fontSize: 11,
  background: "rgba(0,0,0,0.45)",
  padding: "1px 6px",
  borderRadius: 3,
  pointerEvents: "none",
  userSelect: "none",
};

// ─── WebGPU renderer factory ──────────────────────────────────────────────────

async function makeWebGPURenderer(props: any) {
  const renderer = new THREE.WebGPURenderer(props as any);
  await renderer.init();
  return renderer;
}

// ─── MultiCanvasPointerFix ───────────────────────────────────────────────────
// Three.js MapControls/OrbitControls calls setPointerCapture() on pointerdown,
// which locks ALL pointer events to that canvas until mouse release — blocking
// every other canvas from receiving events during a pan.
//
// Fix (two parts):
//  1. No-op setPointerCapture/releasePointerCapture so the browser never locks
//     events to one canvas. Three.js's own pointermove/pointerup listeners on
//     scope.domElement still fire normally while the mouse stays within that canvas.
//  2. Relay every document-level pointerup to this canvas. Without capture,
//     if the user releases the button while the pointer is over a different canvas,
//     Three.js never gets the pointerup → controls get stuck in drag state.
//     The relay ensures controls always clean up regardless of where the button
//     was released. (bubbles:false prevents re-bubbling back to document.)

function MultiCanvasPointerFix() {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement as any;
    const origSet = canvas.setPointerCapture.bind(canvas);
    const origRelease = canvas.releasePointerCapture.bind(canvas);
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};

    const relayUp = (e: PointerEvent) => {
      canvas.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: e.pointerId,
          button: e.button,
          buttons: 0,
          clientX: e.clientX,
          clientY: e.clientY,
          bubbles: false,
        }),
      );
    };
    document.addEventListener("pointerup", relayUp);

    return () => {
      canvas.setPointerCapture = origSet;
      canvas.releasePointerCapture = origRelease;
      document.removeEventListener("pointerup", relayUp);
    };
  }, [gl]);
  return null;
}

// ─── OrthoCloneContext ────────────────────────────────────────────────────────
// Provides a map from clone.uuid → original.uuid for click resolution in ortho.

const OrthoCloneContext = createContext<Map<string, string>>(new Map());

// ─── OrthoSceneRenderer ───────────────────────────────────────────────────────
// Runs inside an ortho Canvas. Reads live meshes from the Zustand store and
// creates context-local visual clones (separate GPU resources). Syncs world
// transforms every frame so the ortho views stay in sync during edits.

type CloneInfo = { original: THREE.Mesh; clone: THREE.Mesh };

function OrthoSceneRenderer({ children }: { children?: React.ReactNode }) {
  const { scene } = useThree();
  const cloneMap = useRef(new Map<string, CloneInfo>());
  const cloneToOriginal = useRef(new Map<string, string>());
  const version = useSceneStore((s) => s.version);

  const syncCloneFromOriginal = useCallback((original: THREE.Mesh, clone: THREE.Mesh) => {
    const newGeo = original.geometry.clone();
    const newMat = Array.isArray(original.material)
      ? (original.material as THREE.Material[]).map((m) => m.clone())
      : (original.material as THREE.Material).clone();
    clone.geometry.dispose();
    if (Array.isArray(clone.material)) clone.material.forEach((m) => m.dispose());
    else clone.material.dispose();
    clone.geometry = newGeo;
    clone.material = newMat;
    clone.visible = original.visible;
    clone.castShadow = original.castShadow;
    clone.receiveShadow = original.receiveShadow;
  }, []);

  const syncCloneGeometry = useCallback((original: THREE.Mesh, clone: THREE.Mesh) => {
    const source = original.geometry;
    const target = clone.geometry;
    const sourceAttrs = source.attributes;
    const targetAttrs = target.attributes;
    const sourceKeys = Object.keys(sourceAttrs);
    const targetKeys = Object.keys(targetAttrs);

    const needsRebuild =
      sourceKeys.length !== targetKeys.length ||
      sourceKeys.some((key) => !(key in targetAttrs)) ||
      Boolean(source.getIndex()) !== Boolean(target.getIndex());

    if (needsRebuild) {
      const next = source.clone();
      target.dispose();
      clone.geometry = next;
      return;
    }

    for (const key of sourceKeys) {
      const srcAttr = sourceAttrs[key] as THREE.BufferAttribute;
      const dstAttr = targetAttrs[key] as THREE.BufferAttribute | undefined;
      if (!dstAttr || srcAttr.array.length !== dstAttr.array.length) {
        const next = source.clone();
        target.dispose();
        clone.geometry = next;
        return;
      }
      (dstAttr.array as Float32Array).set(srcAttr.array as Float32Array);
      dstAttr.needsUpdate = true;
    }

    const srcIdx = source.getIndex();
    const dstIdx = target.getIndex();
    if (srcIdx && dstIdx && srcIdx.array.length === dstIdx.array.length) {
      (dstIdx.array as Uint16Array | Uint32Array).set(srcIdx.array as Uint16Array | Uint32Array);
      dstIdx.needsUpdate = true;
    } else if (srcIdx || dstIdx) {
      const next = source.clone();
      target.dispose();
      clone.geometry = next;
      return;
    }

    clone.geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
    clone.geometry.groups = source.groups.map((g) => ({ ...g }));
  }, []);

  // Rebuild the clone set whenever the scene version changes
  useEffect(() => {
    const { objects } = useSceneStore.getState();
    const map = cloneMap.current;
    const reverseMap = cloneToOriginal.current;

    // Remove stale clones
    for (const [uuid, { clone }] of map) {
      if (!objects.has(uuid) || !(objects.get(uuid) instanceof THREE.Mesh)) {
        scene.remove(clone);
        clone.geometry.dispose();
        if (Array.isArray(clone.material)) clone.material.forEach((m) => m.dispose());
        else clone.material.dispose();
        reverseMap.delete(clone.uuid);
        map.delete(uuid);
        geometrySync.current.delete(uuid);
      }
    }

    // Add clones for newly registered meshes
    for (const [uuid, obj] of objects) {
      if (!(obj instanceof THREE.Mesh)) continue;
      const existing = map.get(uuid);
      if (!existing) {
        // Clone geometry and material so they belong to this GL context
        const geo = obj.geometry.clone();
        const mat = Array.isArray(obj.material)
          ? (obj.material as THREE.Material[]).map((m) => m.clone())
          : (obj.material as THREE.Material).clone();
        const clone = new THREE.Mesh(geo, mat);
        clone.matrixAutoUpdate = false;
        clone.visible = obj.visible;
        clone.castShadow = obj.castShadow;
        clone.receiveShadow = obj.receiveShadow;
        scene.add(clone);
        map.set(uuid, { original: obj, clone });
        reverseMap.set(clone.uuid, uuid);
      } else {
        // Refresh clone geometry/material when scene version changes.
        syncCloneFromOriginal(obj, existing.clone);
      }
    }
  }, [version, scene, syncCloneFromOriginal]);

  const geometrySync = useRef(
    new Map<
      string,
      {
        geometryId: string;
        position: { version: number; count: number };
        normal: { version: number; count: number } | null;
        index: { version: number; count: number } | null;
      }
    >(),
  );

  // Sync transforms from the live mesh world matrices every frame
  useFrame(() => {
    for (const { original, clone } of cloneMap.current.values()) {
      original.updateWorldMatrix(true, false);
      clone.matrix.copy(original.matrixWorld);
      clone.matrixWorld.copy(original.matrixWorld);
      clone.matrixWorldNeedsUpdate = false;

      const geometry = original.geometry;
      const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!posAttr) continue;
      const idxAttr = geometry.getIndex() as THREE.BufferAttribute | null;
      const normalAttr = geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
      const signature = {
        geometryId: geometry.uuid,
        position: { version: posAttr.version, count: posAttr.count },
        normal: normalAttr ? { version: normalAttr.version, count: normalAttr.count } : null,
        index: idxAttr ? { version: idxAttr.version, count: idxAttr.count } : null,
      };
      const prev = geometrySync.current.get(original.uuid);
      if (
        !prev ||
        prev.geometryId !== signature.geometryId ||
        prev.position.version !== signature.position.version ||
        prev.position.count !== signature.position.count ||
        (prev.normal?.version ?? null) !== (signature.normal?.version ?? null) ||
        (prev.normal?.count ?? null) !== (signature.normal?.count ?? null) ||
        (prev.index?.version ?? null) !== (signature.index?.version ?? null) ||
        (prev.index?.count ?? null) !== (signature.index?.count ?? null)
      ) {
        geometrySync.current.set(original.uuid, signature);
        syncCloneGeometry(original, clone);
      }
    }
  });

  // Dispose all clones when unmounting
  useEffect(() => {
    return () => {
      const reverseMap = cloneToOriginal.current;
      for (const { clone } of cloneMap.current.values()) {
        scene.remove(clone);
        clone.geometry.dispose();
        if (Array.isArray(clone.material)) clone.material.forEach((m) => m.dispose());
        else clone.material.dispose();
        reverseMap.delete(clone.uuid);
      }
      cloneMap.current.clear();
      geometrySync.current.clear();
    };
  }, [scene]);

  return (
    <OrthoCloneContext value={cloneToOriginal.current}>
      {children}
    </OrthoCloneContext>
  );
}

// ─── OrthoClickSelector ───────────────────────────────────────────────────────
// Like ClickSelector but raycasts against the ortho scene's clones and maps
// clone UUIDs back to original UUIDs via OrthoCloneContext.

function OrthoClickSelector({ transformDragging }: { transformDragging: boolean }) {
  const { camera, raycaster, gl, scene } = useThree();
  const cloneToOriginal = useContext(OrthoCloneContext);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      pointerDown.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (transformDragging) return;
      const down = pointerDown.current;
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.sqrt(dx * dx + dy * dy) > 4) return;

      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      // Raycast against clones in the ortho scene
      const clones = scene.children.filter((o) => o instanceof THREE.Mesh);
      const hits = raycaster.intersectObjects(clones, true);
      if (hits.length === 0) {
        sceneActions.select(null);
        return;
      }

      // Walk up from hit to find a clone with a known mapping
      let target: THREE.Object3D | null = hits[0].object;
      while (target) {
        const originalUUID = cloneToOriginal.get(target.uuid);
        if (originalUUID) {
          sceneActions.select(originalUUID);
          return;
        }
        target = target.parent;
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
  }, [camera, raycaster, gl, scene, transformDragging, cloneToOriginal]);

  return null;
}

// ─── ModelingVisualsOverlay ───────────────────────────────────────────────────
// Ortho-safe version of ModelingOverlay: renders vertex/edge/face overlays with
// click handlers (using the ortho camera for raycasting), but omits keyboard
// shortcuts and transform/extrude gizmos (those live in the perspective canvas).

function ModelingVisualsOverlay() {
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const objects = useSceneStore((s) => s.objects);
  const version = useSceneStore((s) => s.version);
  const selectedElements = useModelingStore((s) => s.selectedElements);
  const selectionMode = useModelingStore((s) => s.selectionMode);
  const hoverGizmoRef = useRef<{ pos: THREE.Vector3; isSelected: boolean } | null>(null);

  void version;

  const mesh = useMemo(() => {
    if (!selectedUUID) return null;
    const obj = objects.get(selectedUUID);
    return obj instanceof THREE.Mesh ? obj : null;
  }, [selectedUUID, objects]);

  const meshEntries = useMemo(() => {
    const entries: { uuid: string; mesh: THREE.Mesh }[] = [];
    objects.forEach((obj, uuid) => {
      if (obj instanceof THREE.Mesh) entries.push({ uuid, mesh: obj });
    });
    return entries;
  }, [objects]);

  const handleVertexClick = useCallback((uuid: string, idx: number, additive: boolean) => {
    if (uuid !== useSceneStore.getState().selectedUUID) {
      sceneActions.select(uuid);
      modelingActions.clearSelection();
      additive = false;
    }
    modelingActions.selectElement({ type: "vertex", index: idx }, additive);
  }, []);

  const handleEdgeClick = useCallback((uuid: string, a: number, b: number, additive: boolean) => {
    if (uuid !== useSceneStore.getState().selectedUUID) {
      sceneActions.select(uuid);
      modelingActions.clearSelection();
    }
    modelingActions.selectElement(
      { type: "edge", index: Math.min(a, b), index2: Math.max(a, b) },
      additive,
    );
  }, []);

  const handleFaceClick = useCallback((uuid: string, m: THREE.Mesh, faceIdx: number, additive: boolean) => {
    if (uuid !== useSceneStore.getState().selectedUUID) {
      sceneActions.select(uuid);
      modelingActions.clearSelection();
      additive = false;
    }
    const partnerIdx = findQuadPartner(m.geometry, faceIdx);
    if (additive) {
      modelingActions.selectElement({ type: "face", index: faceIdx }, true);
      if (partnerIdx !== null) modelingActions.selectElement({ type: "face", index: partnerIdx }, true);
    } else {
      const elements: SelectedElement[] = [{ type: "face", index: faceIdx }];
      if (partnerIdx !== null) elements.push({ type: "face", index: partnerIdx });
      useModelingStore.getState().clearSelection();
      for (const el of elements) modelingActions.selectElement(el, true);
    }
  }, []);

  if (meshEntries.length === 0) return null;

  return (
    <>
      {mesh && <BoundingBoxGizmo mesh={mesh} showLabels={false} />}
      {selectionMode === "vertex" && <VertexHoverGizmo stateRef={hoverGizmoRef} />}

      {meshEntries.map(({ uuid, mesh: m }) => {
        const isActive = uuid === selectedUUID;
        const activeElements = isActive ? selectedElements : [];
        return (
          <React.Fragment key={uuid}>
            <VertexDots
              mesh={m}
              selectedElements={activeElements}
              selectionMode={selectionMode}
              hoverGizmoRef={isActive ? hoverGizmoRef : undefined}
              onClick={(idx, additive) => handleVertexClick(uuid, idx, additive)}
            />
            <group matrixAutoUpdate={false} matrix={m.matrixWorld}>
              <EdgeLines
                mesh={m}
                selectedElements={activeElements}
                selectionMode={selectionMode}
                onClick={(a, b, additive) => handleEdgeClick(uuid, a, b, additive)}
                addMode={false}
                onAddVertex={() => {}}
                onAddVertexHover={() => {}}
              />
              <FaceOverlays
                mesh={m}
                selectedElements={activeElements}
                selectionMode={selectionMode}
                onClick={(faceIdx, additive) => handleFaceClick(uuid, m, faceIdx, additive)}
                addMode={false}
                onAddVertex={() => {}}
                onAddVertexHover={() => {}}
              />
            </group>
          </React.Fragment>
        );
      })}
    </>
  );
}

// ─── Shared camera position sync ─────────────────────────────────────────────

function OrthoCameraLink({ axes, viewId }: { axes: OrthoAxis[]; viewId: string }) {
  const { controls, camera } = useThree() as { controls: any; camera: THREE.Camera };
  const axesSet = useMemo(() => new Set(axes), [axes]);
  const prevTarget = useRef({ x: NaN, y: NaN, z: NaN });
  const pendingRef = useRef<{ x?: number; y?: number; z?: number } | null>(null);
  // True while the user is actively panning this canvas. Incoming sync is
  // discarded during interaction so it can't override the user's input.
  const isInteracting = useRef(false);

  useEffect(() => {
    return subscribeOrthoTarget((target, source) => {
      if (source === viewId) return;
      const patch: { x?: number; y?: number; z?: number } = {};
      for (const ax of axesSet) {
        patch[ax] = target[ax];
      }
      pendingRef.current = patch;
    });
  }, [axesSet, viewId]);

  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      isInteracting.current = true;
      pendingRef.current = null; // discard any stale sync immediately
    };
    const onEnd = () => { isInteracting.current = false; };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
    };
  }, [controls]);

  useFrame(() => {
    if (!controls?.target) return;
    const t = controls.target as THREE.Vector3;

    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      if (!isInteracting.current) {
        // Apply incoming sync only when user is not panning this canvas.
        // If isInteracting, fall through so local changes are still propagated.
        const delta = { x: 0, y: 0, z: 0 };
        if (pending.x !== undefined) { delta.x = pending.x - t.x; t.x = pending.x; }
        if (pending.y !== undefined) { delta.y = pending.y - t.y; t.y = pending.y; }
        if (pending.z !== undefined) { delta.z = pending.z - t.z; t.z = pending.z; }
        camera.position.x += delta.x;
        camera.position.y += delta.y;
        camera.position.z += delta.z;
        prevTarget.current = { x: t.x, y: t.y, z: t.z };
        return;
      }
    }

    const prev = prevTarget.current;
    const values: { x?: number; y?: number; z?: number } = {};
    if (axesSet.has("x") && t.x !== prev.x) { values.x = t.x; prev.x = t.x; }
    if (axesSet.has("y") && t.y !== prev.y) { values.y = t.y; prev.y = t.y; }
    if (axesSet.has("z") && t.z !== prev.z) { values.z = t.z; prev.z = t.z; }
    if (Object.keys(values).length > 0) {
      updateOrthoTarget(axes, values, viewId);
    }
  });

  return null;
}

// ─── Camera orientation helper ────────────────────────────────────────────────

function OrthoCamera({
  rotation,
  up,
}: {
  rotation: [number, number, number];
  up: [number, number, number];
}) {
  const { camera } = useThree();
  useEffect(() => {
    camera.up.set(...up);
    camera.rotation.set(...rotation);
    camera.updateMatrixWorld();
  }, [camera, rotation, up]);
  return null;
}

// ─── OrthoCanvas ─────────────────────────────────────────────────────────────

type OrthoViewDef = {
  label: string;
  position: [number, number, number];
  rotation: [number, number, number];
  up: [number, number, number];
  axes: OrthoAxis[];
};

type OrthoCanvasProps = OrthoViewDef & {
  isModeling: boolean;
  isBrush: boolean;
  transformDragging: boolean;
  transformMode: TransformMode;
  onTransformDrag: (v: boolean) => void;
};

function OrthoTransformControls({
  transformMode,
  onTransformDrag,
  enabled = true,
}: {
  transformMode: TransformMode;
  onTransformDrag: (v: boolean) => void;
  enabled?: boolean;
}) {
  const snap = useSettingsStore((s) => s.snap);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const [ctrlHeld, setCtrlHeld] = React.useState(false);
  const draggingRef = useRef(false);
  const transformStartRef = useRef<{
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  } | null>(null);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") setCtrlHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") setCtrlHeld(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const selectedObj = selectedUUID
    ? (useSceneStore.getState().objects.get(selectedUUID) ?? null)
    : null;

  useEffect(() => {
    return () => {
      if (draggingRef.current) {
        onTransformDrag(false);
        draggingRef.current = false;
      }
    };
  }, [onTransformDrag]);

  if (!selectedObj || !enabled) return null;

  return (
    <TransformControls
      object={selectedObj}
      mode={transformMode}
      {...resolveSnapProps(snap, ctrlHeld)}
      onMouseDown={() => {
        transformStartRef.current = {
          position: selectedObj.position.toArray() as [number, number, number],
          rotation: [selectedObj.rotation.x, selectedObj.rotation.y, selectedObj.rotation.z],
          scale: selectedObj.scale.toArray() as [number, number, number],
        };
        draggingRef.current = true;
        onTransformDrag(true);
      }}
      onMouseUp={() => {
        draggingRef.current = false;
        onTransformDrag(false);
        const start = transformStartRef.current;
        transformStartRef.current = null;
        if (start && selectedUUID) {
          const after = {
            position: selectedObj.position.toArray() as [number, number, number],
            rotation: [selectedObj.rotation.x, selectedObj.rotation.y, selectedObj.rotation.z] as [
              number,
              number,
              number,
            ],
            scale: selectedObj.scale.toArray() as [number, number, number],
          };
          const moved =
            start.position.some((v, i) => v !== after.position[i]) ||
            start.rotation.some((v, i) => v !== after.rotation[i]) ||
            start.scale.some((v, i) => v !== after.scale[i]);
          if (moved) {
            const cmd = new SetTransformCommand(selectedUUID, start, after);
            historyActions.executeCommand({
              label: cmd.label,
              mergeKey: undefined,
              execute() {
                useSceneStore.getState().invalidate();
              },
              undo() {
                cmd.undo();
              },
            });
          } else {
            useSceneStore.getState().invalidate();
          }
        } else {
          useSceneStore.getState().invalidate();
        }
      }}
    />
  );
}

const ORTHO_VIEWS: OrthoViewDef[] = [
  {
    label: "Top",
    position: [0, 50, 0],
    rotation: [-Math.PI / 2, 0, 0],
    up: [0, 0, -1],
    axes: ["x", "z"],
  },
  {
    label: "Front",
    position: [0, 0, 50],
    rotation: [0, 0, 0],
    up: [0, 1, 0],
    axes: ["x", "y"],
  },
  {
    label: "Right",
    position: [50, 0, 0],
    rotation: [0, Math.PI / 2, 0],
    up: [0, 1, 0],
    axes: ["y", "z"],
  },
];

function OrthoCanvas({
  label,
  position,
  rotation,
  up,
  axes,
  isModeling,
  isBrush,
  transformDragging,
  transformMode,
  onTransformDrag,
}: OrthoCanvasProps) {
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const selectedObj = selectedUUID
    ? (useSceneStore.getState().objects.get(selectedUUID) ?? null)
    : null;
  const modelingTransformMode = useModelingStore((s) => s.transformMode);
  const selectedElements = useModelingStore((s) => s.selectedElements);
  const showModelingTransform = Boolean(
    isModeling &&
      selectedObj instanceof THREE.Mesh &&
      selectedElements.length > 0,
  );
  const [ctrlHeld, setCtrlHeld] = React.useState(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") setCtrlHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") setCtrlHeld(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);
  const onCreated = useCallback(({ camera, size }: { camera: THREE.Camera; size: { width: number; height: number } }) => {
    const ortho = camera as THREE.OrthographicCamera;
    if (!ortho.isOrthographicCamera) return;
    const halfW = size.width / 2;
    const halfH = size.height / 2;
    ortho.left = -halfW;
    ortho.right = halfW;
    ortho.top = halfH;
    ortho.bottom = -halfH;
    ortho.updateProjectionMatrix();
  }, []);

  function OrthoCameraSizer() {
    const { camera, size } = useThree();
    useEffect(() => {
      const ortho = camera as THREE.OrthographicCamera;
      if (!ortho.isOrthographicCamera) return;
      const halfW = size.width / 2;
      const halfH = size.height / 2;
      ortho.left = -halfW;
      ortho.right = halfW;
      ortho.top = halfH;
      ortho.bottom = -halfH;
      ortho.updateProjectionMatrix();
    }, [camera, size]);
    return null;
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        orthographic
        camera={{ position, near: 0.01, far: 2000, zoom: 40 }}
        gl={makeWebGPURenderer}
        style={{ background: "#1a1a1a" }}
        onCreated={onCreated}
      >
        <MultiCanvasPointerFix />
        <OrthoCameraSizer />
        <OrthoCamera rotation={rotation} up={up} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <gridHelper args={[20, 20, "#333", "#2a2a2a"]} />
        {isModeling ? (
          showModelingTransform && selectedObj instanceof THREE.Mesh ? (
            <SelectionTransformGizmo
              mesh={selectedObj}
              selectedElements={selectedElements}
              transformMode={modelingTransformMode}
              onTransformStart={() => onTransformDrag(true)}
              onTransformEnd={() => onTransformDrag(false)}
              ctrlHeld={ctrlHeld}
            />
          ) : null
        ) : !isBrush ? (
          <OrthoTransformControls
            transformMode={transformMode}
            onTransformDrag={onTransformDrag}
          />
        ) : null}
        <OrthoSceneRenderer>
          {!isModeling && !isBrush && <OrthoClickSelector transformDragging={transformDragging} />}
          {isModeling && <ModelingVisualsOverlay />}
          {isBrush && <BrushOverlay />}
          {(isModeling || isBrush) && <WireframeOverlay />}
        </OrthoSceneRenderer>
        <MapControls screenSpacePanning enableRotate={false} enabled={!transformDragging} makeDefault />
        <OrthoCameraLink axes={axes} viewId={label} />
      </Canvas>
      <span style={labelStyle}>{label}</span>
    </div>
  );
}

// ─── SplitViewport ───────────────────────────────────────────────────────────

export function SplitViewport({
  isSplit,
  onToggleSplit,
  transformDragging,
  onTransformDrag,
  transformMode,
  isModeling,
  isBrush,
  perspCameraRef,
  perspControlsRef,
}: Props) {
  // perspRef is used by ClickSelector for correct NDC in split mode
  const perspRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* ── Main perspective canvas — NEVER unmounts ──────────────────────── */}
      {/* CSS resize between full-screen (single mode) and top-left quadrant
          (split mode). Keeping this mounted preserves SceneContent state. */}
      <div
        ref={perspRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: isSplit ? "calc(50% - 1px)" : "100%",
          height: isSplit ? "calc(50% - 1px)" : "100%",
        }}
      >
        <Canvas
          shadows="percentage"
          camera={{ position: [0, 2, 8], fov: 60 }}
          gl={makeWebGPURenderer}
          style={{ background: "#1a1a1a", cursor: "inherit" }}
        >
          <MultiCanvasPointerFix />
          <ViewportGizmoAnimator controlsRef={perspControlsRef} cameraRef={perspCameraRef} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 8, 5]} intensity={1} />
          <gridHelper args={[20, 20, "#333", "#2a2a2a"]} />
          <SceneContent
            onTransformDrag={onTransformDrag}
            transformDragging={transformDragging}
            transformMode={transformMode}
            isModeling={isModeling || isBrush}
            viewportRef={perspRef}
            enableTransformControls={!isSplit}
          />
          {isModeling && <ModelingOverlay />}
          {isBrush && <BrushOverlay />}
          {(isModeling || isBrush) && <WireframeOverlay />}
          <WireframeOnlyMode />
          <OrbitControls
            ref={perspControlsRef}
            makeDefault
            enabled={!transformDragging && !isBrush}
          />
        </Canvas>
        {isSplit && <span style={labelStyle}>Perspective</span>}
      </div>

      <ViewportGizmo cameraRef={perspCameraRef} controlsRef={perspControlsRef} isSplit={isSplit} onToggleSplit={onToggleSplit} />

      {/* ── Ortho views — only mounted in split mode ──────────────────────── */}
      {isSplit && (
        <>
          {/* 1px dividers */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              height: 1,
              background: "#111",
              zIndex: 10,
              marginTop: -1,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: 1,
              background: "#111",
              zIndex: 10,
              marginLeft: -1,
            }}
          />

          {/* Top — top-right quadrant */}
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "calc(50% - 1px)",
              height: "calc(50% - 1px)",
            }}
          >
            <OrthoCanvas
              {...ORTHO_VIEWS[0]}
              isModeling={isModeling}
              isBrush={isBrush}
              transformDragging={transformDragging}
              transformMode={transformMode}
              onTransformDrag={onTransformDrag}
            />
          </div>

          {/* Front — bottom-left quadrant */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: "calc(50% - 1px)",
              height: "calc(50% - 1px)",
            }}
          >
            <OrthoCanvas
              {...ORTHO_VIEWS[1]}
              isModeling={isModeling}
              isBrush={isBrush}
              transformDragging={transformDragging}
              transformMode={transformMode}
              onTransformDrag={onTransformDrag}
            />
          </div>

          {/* Right — bottom-right quadrant */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: "calc(50% - 1px)",
              height: "calc(50% - 1px)",
            }}
          >
            <OrthoCanvas
              {...ORTHO_VIEWS[2]}
              isModeling={isModeling}
              isBrush={isBrush}
              transformDragging={transformDragging}
              transformMode={transformMode}
              onTransformDrag={onTransformDrag}
            />
          </div>
        </>
      )}
    </div>
  );
}
