/**
 * ModelingOverlay — R3F component rendered inside the Canvas when Modeling Mode is active.
 * Responsibilities:
 *   - Renders vertex/edge/face highlight spheres/lines over the selected mesh
 *   - Handles pointer events: click to select, Shift+click for additive
 *   - TransformControls gizmo (translate/rotate/scale) on selection centroid
 *   - G/R/S hotkeys to switch transform mode; Tab exits to Object Mode
 */
import React, { useEffect, useMemo, useCallback, useState, useRef } from "react";
import { isModKey } from "../../../utils/platform";
import * as THREE from "three/webgpu";
import { useSceneStore, sceneActions } from "../../../store/sceneStore";
import { historyActions } from "../../../store/historyStore";
import { GeometryEditCommand, snapshotGeometry } from "../../../store/commands";
import {
  useModelingStore,
  modelingActions,
  type SelectedElement,
} from "../../../store/modelingStore";
import { getPositions, getIndices, selectedVertexIndices, flushPositions, addVertexOnEdge, addVertexOnFace, bevelEdge, bevelFace, bevelQuadFace, extrudeFace, extrudeQuadFace, groupFacesIntoPolygons, findQuadPartner } from "./helpers";
import type { ModelingState } from "../../../store/modelingStore";
import { ExtrudeInteractiveGizmo } from "./ExtrudeInteractiveGizmo";
import { BoundingBoxGizmo } from "./BoundingBoxGizmo";
import { VertexHoverGizmo } from "./VertexHoverGizmo";
import { VertexDots } from "./VertexDots";
import { EdgeLines } from "./EdgeLines";
import { FaceOverlays } from "./FaceOverlays";
import { SelectionTransformGizmo } from "./SelectionTransformGizmo";
import { AddVertexPreviewGizmo } from "./AddVertexPreviewGizmo";
import type { AddVertexHitType } from "./AddVertexPreviewGizmo";

// ── Module-level helpers ─────────────────────────────────────────────────────

function getSelectedMesh(): { uuid: string; mesh: THREE.Mesh } | null {
  const { selectedUUID, objects } = useSceneStore.getState();
  if (!selectedUUID) return null;
  const obj = objects.get(selectedUUID);
  return obj instanceof THREE.Mesh ? { uuid: selectedUUID, mesh: obj } : null;
}

/** Snapshot → run fn() → record GeometryEditCommand. fn() may return false to abort. */
function withGeoOp(uuid: string, label: string, fn: () => boolean | void): void {
  const before = snapshotGeometry(uuid);
  if (fn() === false) return;
  const after = snapshotGeometry(uuid);
  if (before && after) {
    historyActions.executeCommand(
      new GeometryEditCommand(uuid, before.positions, before.indices, after.positions, after.indices, label),
    );
  } else {
    sceneActions.invalidate();
  }
}

/** Apply bevel to current selection. Returns false if nothing to bevel. */
function applyBevel(mesh: THREE.Mesh, mState: ModelingState): boolean {
  if (mState.selectionMode === "face") {
    const faces = mState.selectedElements.filter((el) => el.type === "face");
    if (!faces.length) return false;
    const polygons = groupFacesIntoPolygons(faces.map((el) => el.index), mesh.geometry);
    for (const poly of polygons)
      poly.kind === "quad"
        ? bevelQuadFace(mesh.geometry, poly.faceIdxA, poly.faceIdxB, mState.bevelAmount)
        : bevelFace(mesh.geometry, poly.faceIdx, mState.bevelAmount);
  } else {
    const edges = mState.selectedElements.filter((el) => el.type === "edge" && el.index2 !== undefined);
    if (!edges.length) return false;
    for (const el of edges) bevelEdge(mesh.geometry, el.index, el.index2!, mState.bevelAmount);
  }
  return true;
}

/** Apply extrude to a set of face elements, in descending face-index order. */
function applyExtrude(geo: THREE.BufferGeometry, faces: SelectedElement[], amount: number): void {
  const polygons = groupFacesIntoPolygons(faces.map((el) => el.index), geo);
  polygons.sort((a, b) => {
    const min = (p: typeof a) => (p.kind === "quad" ? Math.min(p.faceIdxA, p.faceIdxB) : p.faceIdx);
    return min(b) - min(a);
  });
  for (const poly of polygons)
    poly.kind === "quad"
      ? extrudeQuadFace(geo, poly.faceIdxA, poly.faceIdxB, amount)
      : extrudeFace(geo, poly.faceIdx, amount);
}

export function ModelingOverlay(): React.JSX.Element | null {
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const objects = useSceneStore((s) => s.objects);
  const version = useSceneStore((s) => s.version);
  const selectedElements = useModelingStore((s) => s.selectedElements);
  const selectionMode = useModelingStore((s) => s.selectionMode);
  const transformMode = useModelingStore((s) => s.transformMode);
  const modelingTool = useModelingStore((s) => s.modelingTool);
  const bevelPending = useModelingStore((s) => s.bevelPending);
  const extrudePending = useModelingStore((s) => s.extrudePending);
  const extrudeInteractive = useModelingStore((s) => s.extrudeInteractive);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const hoverGizmoRef = useRef<{ pos: THREE.Vector3; isSelected: boolean } | null>(null);
  const [addVertexPreview, setAddVertexPreview] = useState<{ point: THREE.Vector3; hitType: AddVertexHitType } | null>(null);

  void version; // force re-render on geometry changes

  // Track Ctrl key for snapping
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

  // Apply bevel when toolbar button is clicked (bevelPending flag)
  useEffect(() => {
    if (!bevelPending) return;
    modelingActions.clearBevelPending();
    const sel = getSelectedMesh();
    if (!sel) return;
    const mState = useModelingStore.getState();
    withGeoOp(sel.uuid, "Bevel", () => {
      if (!applyBevel(sel.mesh, mState)) return false;
      modelingActions.clearSelection();
    });
  }, [bevelPending]);

  // Apply extrude when toolbar button is clicked (extrudePending flag)
  useEffect(() => {
    if (!extrudePending) return;
    modelingActions.clearExtrudePending();
    const sel = getSelectedMesh();
    if (!sel) return;
    const mState = useModelingStore.getState();
    if (mState.selectionMode !== "face") return;
    const faces = mState.selectedElements.filter((el) => el.type === "face");
    if (!faces.length) return;
    withGeoOp(sel.uuid, "Extrude", () => {
      applyExtrude(sel.mesh.geometry, faces, mState.extrudeAmount);
      modelingActions.clearSelection();
    });
  }, [extrudePending]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Tab") {
        e.preventDefault();
        modelingActions.setEditorMode("object");
      } else if (isModKey(e) && (e.key === "b" || e.key === "B")) {
        // Ctrl+B — apply bevel to all selected edges or faces
        e.preventDefault();
        const sel = getSelectedMesh();
        if (!sel) return;
        const mState = useModelingStore.getState();
        withGeoOp(sel.uuid, "Bevel", () => {
          if (!applyBevel(sel.mesh, mState)) return false;
          modelingActions.clearSelection();
        });
      } else if (isModKey(e) && (e.key === "e" || e.key === "E")) {
        // Ctrl+E — extrude selected faces
        e.preventDefault();
        if (useModelingStore.getState().selectionMode === "face") {
          modelingActions.requestExtrude();
        }
      } else if (e.key === "g" || e.key === "G") {
        modelingActions.setTransformMode("translate");
      } else if (e.key === "r" || e.key === "R") {
        modelingActions.setTransformMode("rotate");
      } else if (e.key === "s" || e.key === "S") {
        modelingActions.setTransformMode("scale");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Delete selected sub-elements from the active mesh
        const sel = getSelectedMesh();
        if (!sel) return;
        const mState = useModelingStore.getState();
        if (!mState.selectedElements.length) return;
        const geo = sel.mesh.geometry;
        const oldIndices = getIndices(geo);
        if (!oldIndices) return; // non-indexed — skip for safety
        withGeoOp(sel.uuid, "Delete Elements", () => {
          const positions = getPositions(geo);
          const elements = mState.selectedElements;
          let newTriIndices: number[];
          if (mState.selectionMode === "face") {
            // Face mode: remove exact triangle indices to avoid deleting adjacent
            // faces that share vertices (e.g. extrusion side walls).
            const facesToRemove = new Set(elements.filter((e) => e.type === "face").map((e) => e.index));
            newTriIndices = [];
            for (let t = 0; t < oldIndices.length; t += 3) {
              if (!facesToRemove.has(t / 3)) newTriIndices.push(oldIndices[t], oldIndices[t + 1], oldIndices[t + 2]);
            }
          } else {
            // Vertex/Edge mode: remove all triangles that touch any selected vertex.
            const toRemove = selectedVertexIndices(elements, geo);
            newTriIndices = [];
            for (let t = 0; t < oldIndices.length; t += 3) {
              const a = oldIndices[t], b = oldIndices[t + 1], c = oldIndices[t + 2];
              if (!toRemove.has(a) && !toRemove.has(b) && !toRemove.has(c)) newTriIndices.push(a, b, c);
            }
          }
          // Compact vertex buffer: remove vertices not referenced by remaining triangles
          const usedVerts = new Set(newTriIndices);
          const remap = new Map<number, number>();
          let newIdx = 0;
          for (let i = 0; i < positions.length / 3; i++) {
            if (usedVerts.has(i)) remap.set(i, newIdx++);
          }
          const newPositions = new Float32Array(newIdx * 3);
          for (const [oldI, newI] of remap) {
            newPositions[newI * 3] = positions[oldI * 3];
            newPositions[newI * 3 + 1] = positions[oldI * 3 + 1];
            newPositions[newI * 3 + 2] = positions[oldI * 3 + 2];
          }
          geo.setIndex(new THREE.BufferAttribute(new Uint32Array(newTriIndices.map((i) => remap.get(i)!)), 1));
          flushPositions(geo, newPositions);
          modelingActions.clearSelection();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const handleTransformStart = useCallback(() => {
    // Disable OrbitControls while dragging gizmo
    // (TransformControls fires stopPropagation on pointer events so OrbitControls
    // won't activate, but we set the flag to be safe.)
  }, []);

  const handleTransformEnd = useCallback(() => {
    sceneActions.invalidate();
  }, []);

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

  // ── Interactive extrude commit / cancel ────────────────────────────────────
  const handleExtrudeCommit = useCallback(
    (amount: number) => {
      modelingActions.setExtrudeInteractive(false);
      if (!mesh) return;
      const selUUID = useSceneStore.getState().selectedUUID;
      if (!selUUID) return;
      const faces = useModelingStore.getState().selectedElements.filter((el) => el.type === "face");
      if (!faces.length) return;
      withGeoOp(selUUID, "Extrude (Interactive)", () => {
        applyExtrude(mesh.geometry, faces, amount);
        modelingActions.clearSelection();
      });
    },
    [mesh],
  );

  const handleExtrudeCancel = useCallback(() => {
    modelingActions.setExtrudeInteractive(false);
  }, []);

  const addMode = modelingTool === "add" && selectionMode === "vertex";

  const handleAddVertexOnEdge = useCallback(
    (a: number, b: number, worldPoint: THREE.Vector3) => {
      if (!mesh) return;
      const selUUID = useSceneStore.getState().selectedUUID;
      if (!selUUID) return;
      withGeoOp(selUUID, "Add Vertex on Edge", () => {
        addVertexOnEdge(mesh.geometry, a, b, mesh.worldToLocal(worldPoint.clone()));
      });
    },
    [mesh],
  );

  const handleAddVertexOnFace = useCallback(
    (faceIdx: number, worldPoint: THREE.Vector3) => {
      if (!mesh) return;
      const selUUID = useSceneStore.getState().selectedUUID;
      if (!selUUID) return;
      withGeoOp(selUUID, "Add Vertex on Face", () => {
        addVertexOnFace(mesh.geometry, faceIdx, mesh.worldToLocal(worldPoint.clone()));
      });
    },
    [mesh],
  );

  const handleAddVertexEdgeHover = useCallback(
    (_a: number, _b: number, point: THREE.Vector3 | null) => {
      setAddVertexPreview(point ? { point, hitType: "edge" } : null);
    },
    [],
  );

  const handleAddVertexFaceHover = useCallback(
    (_faceIdx: number, point: THREE.Vector3 | null) => {
      setAddVertexPreview(point ? { point, hitType: "face" } : null);
    },
    [],
  );

  if (meshEntries.length === 0) return null;

  return (
    <>
      {/* Selected-mesh-only gizmos */}
      {mesh && <BoundingBoxGizmo mesh={mesh} />}
      {selectionMode === "vertex" && <VertexHoverGizmo stateRef={hoverGizmoRef} />}

      {/* Overlays for ALL meshes in scene */}
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
              addMode={isActive ? addMode : false}
              onAddVertex={isActive ? handleAddVertexOnEdge : () => {}}
              onAddVertexHover={isActive ? handleAddVertexEdgeHover : () => {}}
            />
            <FaceOverlays
              mesh={m}
              selectedElements={activeElements}
              selectionMode={selectionMode}
              onClick={(faceIdx, additive) => handleFaceClick(uuid, m, faceIdx, additive)}
              addMode={isActive ? addMode : false}
              onAddVertex={isActive ? handleAddVertexOnFace : () => {}}
              onAddVertexHover={isActive ? handleAddVertexFaceHover : () => {}}
            />
          </group>
          </React.Fragment>
        );
      })}

      {/* Add-vertex preview gizmo — shows where new vertex will land + edge/face label */}
      {addMode && addVertexPreview && (
        <AddVertexPreviewGizmo
          worldPoint={addVertexPreview.point}
          hitType={addVertexPreview.hitType}
        />
      )}
      {mesh && selectedElements.length > 0 && !extrudeInteractive && (
        <SelectionTransformGizmo
          mesh={mesh}
          selectedElements={selectedElements}
          transformMode={transformMode}
          onTransformStart={handleTransformStart}
          onTransformEnd={handleTransformEnd}
          ctrlHeld={ctrlHeld}
        />
      )}
      {mesh && extrudeInteractive && (
        <ExtrudeInteractiveGizmo
          mesh={mesh}
          selectedElements={selectedElements}
          onCommit={handleExtrudeCommit}
          onCancel={handleExtrudeCancel}
        />
      )}
    </>
  );
}
