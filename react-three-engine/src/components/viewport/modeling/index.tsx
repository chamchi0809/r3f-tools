/**
 * ModelingOverlay — R3F component rendered inside the Canvas when Modeling Mode is active.
 * Responsibilities:
 *   - Renders vertex/edge/face highlight spheres/lines over the selected mesh
 *   - Handles pointer events: click to select, Shift+click for additive
 *   - TransformControls gizmo (translate/rotate/scale) on selection centroid
 *   - G/R/S hotkeys to switch transform mode; Tab exits to Object Mode
 */
import React, { useEffect, useMemo, useCallback, useState } from "react";
import * as THREE from "three/webgpu";
import { useSceneStore, sceneActions } from "../../../store/sceneStore";
import {
  useModelingStore,
  modelingActions,
} from "../../../store/modelingStore";
import { getPositions, getIndices, selectedVertexIndices, flushPositions, addVertexOnEdge, addVertexOnFace, bevelEdge } from "./helpers";
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
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [hoveredVertexIdx, setHoveredVertexIdx] = useState<number | null>(null);
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
    const edges = mState.selectedElements.filter((el) => el.type === "edge");
    if (edges.length === 0) return;
    for (const el of edges) {
      if (el.index2 === undefined) continue;
      bevelEdge(obj.geometry, el.index, el.index2, mState.bevelAmount);
    }
    modelingActions.clearSelection();
    sceneActions.invalidate();
  }, [bevelPending]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Tab") {
        e.preventDefault();
        modelingActions.setEditorMode("object");
      } else if (e.ctrlKey && (e.key === "b" || e.key === "B")) {
        // Ctrl+B — apply bevel to all selected edges
        e.preventDefault();
        const state = useSceneStore.getState();
        const mState = useModelingStore.getState();
        const selUUID = state.selectedUUID;
        if (!selUUID) return;
        const obj = state.objects.get(selUUID);
        if (!(obj instanceof THREE.Mesh)) return;
        const edges = mState.selectedElements.filter((el) => el.type === "edge");
        if (edges.length === 0) return;
        for (const el of edges) {
          if (el.index2 === undefined) continue;
          bevelEdge(obj.geometry, el.index, el.index2, mState.bevelAmount);
        }
        modelingActions.clearSelection();
        sceneActions.invalidate();
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

        const positions = getPositions(geo);
        const oldIndices = getIndices(geo);
        if (!oldIndices) return; // non-indexed — skip for safety

        // Collect vertex indices to remove (all vertices touched by selection)
        const toRemove = selectedVertexIndices(elements, geo);

        // Remove triangles that reference any removed vertex
        const newTriIndices: number[] = [];
        for (let t = 0; t < oldIndices.length; t += 3) {
          const a = oldIndices[t],
            b = oldIndices[t + 1],
            c = oldIndices[t + 2];
          if (!toRemove.has(a) && !toRemove.has(b) && !toRemove.has(c)) {
            newTriIndices.push(a, b, c);
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

  const handleVertexHover = useCallback((idx: number | null) => {
    setHoveredVertexIdx(idx);
  }, []);

  // World-space position of the hovered vertex (for the gizmo rendered outside the local group)
  const hoveredVertexWorldPos = useMemo(() => {
    if (hoveredVertexIdx === null || !mesh) return null;
    const positions = getPositions(mesh.geometry);
    if (hoveredVertexIdx >= positions.length / 3) return null;
    return new THREE.Vector3(
      positions[hoveredVertexIdx * 3],
      positions[hoveredVertexIdx * 3 + 1],
      positions[hoveredVertexIdx * 3 + 2],
    ).applyMatrix4(mesh.matrixWorld);
  }, [hoveredVertexIdx, mesh, version]); // version ensures refresh after geometry edits

  const handleTransformStart = useCallback(() => {
    // Disable OrbitControls while dragging gizmo
    // (TransformControls fires stopPropagation on pointer events so OrbitControls
    // won't activate, but we set the flag to be safe.)
  }, []);

  const handleTransformEnd = useCallback(() => {
    sceneActions.invalidate();
  }, []);

  const handleVertexClick = useCallback((idx: number, additive: boolean) => {
    modelingActions.selectElement({ type: "vertex", index: idx }, additive);
  }, []);

  const handleEdgeClick = useCallback((a: number, b: number, additive: boolean) => {
    modelingActions.selectElement(
      { type: "edge", index: Math.min(a, b), index2: Math.max(a, b) },
      additive,
    );
  }, []);

  const handleFaceClick = useCallback((faceIdx: number, additive: boolean) => {
    modelingActions.selectElement({ type: "face", index: faceIdx }, additive);
  }, []);

  const addMode = modelingTool === "add" && selectionMode === "vertex";

  const handleAddVertexOnEdge = useCallback(
    (a: number, b: number, worldPoint: THREE.Vector3) => {
      if (!mesh) return;
      const localPoint = mesh.worldToLocal(worldPoint.clone());
      addVertexOnEdge(mesh.geometry, a, b, localPoint);
      sceneActions.invalidate();
    },
    [mesh],
  );

  const handleAddVertexOnFace = useCallback(
    (faceIdx: number, worldPoint: THREE.Vector3) => {
      if (!mesh) return;
      const localPoint = mesh.worldToLocal(worldPoint.clone());
      addVertexOnFace(mesh.geometry, faceIdx, localPoint);
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

  if (!mesh) return null;

  return (
    <>
      {/* SketchUp-style bounding box — wireframe + edge-midpoint dimension labels */}
      <BoundingBoxGizmo mesh={mesh} />
      {/* Vertex hover radius gizmo — rendered in world space, outside the local mesh group */}
      {selectionMode === "vertex" && hoveredVertexWorldPos && (
        <VertexHoverGizmo
          position={hoveredVertexWorldPos}
          isSelected={selectedElements.some(
            (e) => e.type === "vertex" && e.index === hoveredVertexIdx,
          )}
        />
      )}
      <group matrixAutoUpdate={false} matrix={mesh.matrixWorld}>
        <VertexDots
          mesh={mesh}
          selectedElements={selectedElements}
          selectionMode={selectionMode}
          onHover={handleVertexHover}
          onClick={handleVertexClick}
        />
        <EdgeLines
          mesh={mesh}
          selectedElements={selectedElements}
          selectionMode={selectionMode}
          onClick={handleEdgeClick}
          addMode={addMode}
          onAddVertex={handleAddVertexOnEdge}
          onAddVertexHover={handleAddVertexEdgeHover}
        />
        <FaceOverlays
          mesh={mesh}
          selectedElements={selectedElements}
          selectionMode={selectionMode}
          onClick={handleFaceClick}
          addMode={addMode}
          onAddVertex={handleAddVertexOnFace}
          onAddVertexHover={handleAddVertexFaceHover}
        />
      </group>
      {/* Add-vertex preview gizmo — shows where new vertex will land + edge/face label */}
      {addMode && addVertexPreview && (
        <AddVertexPreviewGizmo
          worldPoint={addVertexPreview.point}
          hitType={addVertexPreview.hitType}
        />
      )}
      {selectedElements.length > 0 && (
        <SelectionTransformGizmo
          mesh={mesh}
          selectedElements={selectedElements}
          transformMode={transformMode}
          onTransformStart={handleTransformStart}
          onTransformEnd={handleTransformEnd}
          ctrlHeld={ctrlHeld}
        />
      )}
    </>
  );
}
