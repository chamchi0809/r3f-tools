/**
 * ModelingOverlay — R3F component rendered inside the Canvas when Modeling Mode is active.
 * Responsibilities:
 *   - Renders vertex/edge/face highlight spheres/lines over the selected mesh
 *   - Handles pointer events: click to select, Shift+click for additive
 *   - TransformControls gizmo (translate/rotate/scale) on selection centroid
 *   - G/R/S hotkeys to switch transform mode; Tab exits to Object Mode
 */
import React, { useEffect, useMemo, useCallback, useState, useRef } from "react";
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
import { ExtrudeInteractiveGizmo } from "./ExtrudeInteractiveGizmo";
import { BoundingBoxGizmo } from "./BoundingBoxGizmo";
import { VertexHoverGizmo } from "./VertexHoverGizmo";
import { VertexDots } from "./VertexDots";
import { EdgeLines } from "./EdgeLines";
import { FaceOverlays } from "./FaceOverlays";
import { SelectionTransformGizmo } from "./SelectionTransformGizmo";
import { AddVertexPreviewGizmo } from "./AddVertexPreviewGizmo";
import type { AddVertexHitType } from "./AddVertexPreviewGizmo";

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

  // Apply bevel when toolbar button is clicked (bevelPending flag)
  useEffect(() => {
    if (!bevelPending) return;
    modelingActions.clearBevelPending();
    const state = useSceneStore.getState();
    const mState = useModelingStore.getState();
    const selUUID = state.selectedUUID;
    if (!selUUID) return;
    const obj = state.objects.get(selUUID);
    if (!(obj instanceof THREE.Mesh)) return;
    const before = snapshotGeometry(selUUID);
    if (mState.selectionMode === "face") {
      const faces = mState.selectedElements.filter((el) => el.type === "face");
      if (faces.length === 0) return;
      const polygons = groupFacesIntoPolygons(faces.map((el) => el.index), obj.geometry);
      for (const poly of polygons) {
        if (poly.kind === "quad") {
          bevelQuadFace(obj.geometry, poly.faceIdxA, poly.faceIdxB, mState.bevelAmount);
        } else {
          bevelFace(obj.geometry, poly.faceIdx, mState.bevelAmount);
        }
      }
    } else {
      const edges = mState.selectedElements.filter((el) => el.type === "edge");
      if (edges.length === 0) return;
      for (const el of edges) {
        if (el.index2 === undefined) continue;
        bevelEdge(obj.geometry, el.index, el.index2, mState.bevelAmount);
      }
    }
    modelingActions.clearSelection();
    if (before) {
      const after = snapshotGeometry(selUUID);
      if (after) {
        historyActions.executeCommand(
          new GeometryEditCommand(selUUID, before.positions, before.indices, after.positions, after.indices, "Bevel"),
        );
        return; // GeometryEditCommand calls invalidate internally
      }
    }
    sceneActions.invalidate();
  }, [bevelPending]);

  // Apply extrude when toolbar button is clicked (extrudePending flag)
  useEffect(() => {
    if (!extrudePending) return;
    modelingActions.clearExtrudePending();
    const state = useSceneStore.getState();
    const mState = useModelingStore.getState();
    const selUUID = state.selectedUUID;
    if (!selUUID) return;
    const obj = state.objects.get(selUUID);
    if (!(obj instanceof THREE.Mesh)) return;
    if (mState.selectionMode !== "face") return;
    const faces = mState.selectedElements.filter((el) => el.type === "face");
    if (faces.length === 0) return;
    const before = snapshotGeometry(selUUID);
    const polygons = groupFacesIntoPolygons(faces.map((el) => el.index), obj.geometry);
    // Process in descending face-index order so earlier mutations don't corrupt later indices
    polygons.sort((a, b) => {
      const aMin = a.kind === "quad" ? Math.min(a.faceIdxA, a.faceIdxB) : a.faceIdx;
      const bMin = b.kind === "quad" ? Math.min(b.faceIdxA, b.faceIdxB) : b.faceIdx;
      return bMin - aMin;
    });
    for (const poly of polygons) {
      if (poly.kind === "quad") {
        extrudeQuadFace(obj.geometry, poly.faceIdxA, poly.faceIdxB, mState.extrudeAmount);
      } else {
        extrudeFace(obj.geometry, poly.faceIdx, mState.extrudeAmount);
      }
    }
    modelingActions.clearSelection();
    if (before) {
      const after = snapshotGeometry(selUUID);
      if (after) {
        historyActions.executeCommand(
          new GeometryEditCommand(selUUID, before.positions, before.indices, after.positions, after.indices, "Extrude"),
        );
        return;
      }
    }
    sceneActions.invalidate();
  }, [extrudePending]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Tab") {
        e.preventDefault();
        modelingActions.setEditorMode("object");
      } else if (e.ctrlKey && (e.key === "b" || e.key === "B")) {
        // Ctrl+B — apply bevel to all selected edges or faces
        e.preventDefault();
        const state = useSceneStore.getState();
        const mState = useModelingStore.getState();
        const selUUID = state.selectedUUID;
        if (!selUUID) return;
        const obj = state.objects.get(selUUID);
        if (!(obj instanceof THREE.Mesh)) return;
        const before = snapshotGeometry(selUUID);
        if (mState.selectionMode === "face") {
          const faces = mState.selectedElements.filter((el) => el.type === "face");
          if (faces.length === 0) return;
          const polygons = groupFacesIntoPolygons(faces.map((el) => el.index), obj.geometry);
          for (const poly of polygons) {
            if (poly.kind === "quad") {
              bevelQuadFace(obj.geometry, poly.faceIdxA, poly.faceIdxB, mState.bevelAmount);
            } else {
              bevelFace(obj.geometry, poly.faceIdx, mState.bevelAmount);
            }
          }
        } else {
          const edges = mState.selectedElements.filter((el) => el.type === "edge");
          if (edges.length === 0) return;
          for (const el of edges) {
            if (el.index2 === undefined) continue;
            bevelEdge(obj.geometry, el.index, el.index2, mState.bevelAmount);
          }
        }
        modelingActions.clearSelection();
        if (before) {
          const after = snapshotGeometry(selUUID);
          if (after) {
            historyActions.executeCommand(
              new GeometryEditCommand(selUUID, before.positions, before.indices, after.positions, after.indices, "Bevel"),
            );
            return;
          }
        }
        sceneActions.invalidate();
      } else if (e.ctrlKey && (e.key === "e" || e.key === "E")) {
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
        const state = useSceneStore.getState();
        const mState = useModelingStore.getState();
        const selUUID = state.selectedUUID;
        if (!selUUID) return;
        const obj = state.objects.get(selUUID);
        if (!(obj instanceof THREE.Mesh)) return;
        const geo = obj.geometry;
        const elements = mState.selectedElements;
        if (elements.length === 0) return;

        const before = snapshotGeometry(selUUID);
        const positions = getPositions(geo);
        const oldIndices = getIndices(geo);
        if (!oldIndices) return; // non-indexed — skip for safety

        let newTriIndices: number[];

        if (mState.selectionMode === "face") {
          // Face mode: remove exact triangle indices to avoid deleting adjacent
          // faces that share vertices (e.g. extrusion side walls).
          const facesToRemove = new Set(
            elements.filter((e) => e.type === "face").map((e) => e.index),
          );
          newTriIndices = [];
          for (let t = 0; t < oldIndices.length; t += 3) {
            if (!facesToRemove.has(t / 3)) {
              newTriIndices.push(oldIndices[t], oldIndices[t + 1], oldIndices[t + 2]);
            }
          }
        } else {
          // Vertex/Edge mode: remove all triangles that touch any selected vertex.
          const toRemove = selectedVertexIndices(elements, geo);
          newTriIndices = [];
          for (let t = 0; t < oldIndices.length; t += 3) {
            const a = oldIndices[t],
              b = oldIndices[t + 1],
              c = oldIndices[t + 2];
            if (!toRemove.has(a) && !toRemove.has(b) && !toRemove.has(c)) {
              newTriIndices.push(a, b, c);
            }
          }
        }

        // Compact vertex buffer: remove vertices not referenced by remaining triangles
        const usedVerts = new Set(newTriIndices);
        // Build old→new index remap
        const remap = new Map<number, number>();
        let newIdx = 0;
        for (let i = 0; i < positions.length / 3; i++) {
          if (usedVerts.has(i)) {
            remap.set(i, newIdx++);
          }
        }
        const newPositions = new Float32Array(newIdx * 3);
        for (const [oldI, newI] of remap) {
          newPositions[newI * 3] = positions[oldI * 3];
          newPositions[newI * 3 + 1] = positions[oldI * 3 + 1];
          newPositions[newI * 3 + 2] = positions[oldI * 3 + 2];
        }
        const remappedIndices = newTriIndices.map((i) => remap.get(i)!);

        // Apply back to geometry
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(remappedIndices), 1));
        flushPositions(geo, newPositions);
        modelingActions.clearSelection();
        if (before) {
          const after = snapshotGeometry(selUUID);
          if (after) {
            historyActions.executeCommand(
              new GeometryEditCommand(selUUID, before.positions, before.indices, after.positions, after.indices, "Delete Elements"),
            );
            return;
          }
        }
        sceneActions.invalidate();
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
      const mState = useModelingStore.getState();
      const faces = mState.selectedElements.filter((el) => el.type === "face");
      if (faces.length === 0) return;
      const before = snapshotGeometry(selUUID);
      const polygons = groupFacesIntoPolygons(
        faces.map((el) => el.index),
        mesh.geometry,
      );
      polygons.sort((a, b) => {
        const aMin = a.kind === "quad" ? Math.min(a.faceIdxA, a.faceIdxB) : a.faceIdx;
        const bMin = b.kind === "quad" ? Math.min(b.faceIdxA, b.faceIdxB) : b.faceIdx;
        return bMin - aMin;
      });
      for (const poly of polygons) {
        if (poly.kind === "quad") {
          extrudeQuadFace(mesh.geometry, poly.faceIdxA, poly.faceIdxB, amount);
        } else {
          extrudeFace(mesh.geometry, poly.faceIdx, amount);
        }
      }
      modelingActions.clearSelection();
      if (before) {
        const after = snapshotGeometry(selUUID);
        if (after) {
          historyActions.executeCommand(
            new GeometryEditCommand(selUUID, before.positions, before.indices, after.positions, after.indices, "Extrude (Interactive)"),
          );
          return;
        }
      }
      sceneActions.invalidate();
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
      const before = snapshotGeometry(selUUID);
      const localPoint = mesh.worldToLocal(worldPoint.clone());
      addVertexOnEdge(mesh.geometry, a, b, localPoint);
      if (before) {
        const after = snapshotGeometry(selUUID);
        if (after) {
          historyActions.executeCommand(
            new GeometryEditCommand(selUUID, before.positions, before.indices, after.positions, after.indices, "Add Vertex on Edge"),
          );
          return;
        }
      }
      sceneActions.invalidate();
    },
    [mesh],
  );

  const handleAddVertexOnFace = useCallback(
    (faceIdx: number, worldPoint: THREE.Vector3) => {
      if (!mesh) return;
      const selUUID = useSceneStore.getState().selectedUUID;
      if (!selUUID) return;
      const before = snapshotGeometry(selUUID);
      const localPoint = mesh.worldToLocal(worldPoint.clone());
      addVertexOnFace(mesh.geometry, faceIdx, localPoint);
      if (before) {
        const after = snapshotGeometry(selUUID);
        if (after) {
          historyActions.executeCommand(
            new GeometryEditCommand(selUUID, before.positions, before.indices, after.positions, after.indices, "Add Vertex on Face"),
          );
          return;
        }
      }
      sceneActions.invalidate();
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
