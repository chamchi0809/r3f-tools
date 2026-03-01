import { TransformControls } from "@react-three/drei";
import React, { useEffect, useMemo, useCallback, useRef } from "react";
import * as THREE from "three/webgpu";
import { sceneActions } from "../../../store/sceneStore";
import {
  modelingActions,
  type SelectedElement,
  type ModelingTransformMode,
} from "../../../store/modelingStore";
import { useSettingsStore, resolveSnapProps } from "../../../store/settingsStore";
import {
  getPositions,
  selectedVertexIndices,
  expandToColocated,
  flushPositions,
} from "./helpers";

/**
 * Places a TransformControls gizmo at the centroid of the selected sub-elements.
 * On transform change, converts the pivot delta back to local vertex offsets.
 *
 * Supports translate, rotate, and scale.
 * - Translate: moves vertices by world-space delta converted to local space.
 * - Rotate: rotates vertices around the centroid (local space).
 * - Scale: scales vertices relative to centroid (local space).
 *
 * Note: rotate/scale are meaningful for edges and faces (2+ vertices),
 * but have no visual effect on single isolated vertices.
 */
export function SelectionTransformGizmo({
  mesh,
  selectedElements,
  transformMode,
  onTransformStart,
  onTransformEnd,
  ctrlHeld,
}: {
  mesh: THREE.Mesh;
  selectedElements: SelectedElement[];
  transformMode: ModelingTransformMode;
  onTransformStart: () => void;
  onTransformEnd: () => void;
  ctrlHeld: boolean;
}) {
  const snap = useSettingsStore((s) => s.snap);
  // We don't need useThree here — drei's TransformControls auto-disables OrbitControls.

  // Pivot object lives for the lifetime of this component instance.
  // Pivot ref — must be a rendered <group> so drei can attach controls to it.
  const pivotRef = useRef<THREE.Group>(null!);

  // Snapshot of each selected vertex's local position when a drag starts.
  const snapPositions = useRef<Map<number, THREE.Vector3>>(new Map());
  // Centroid in LOCAL mesh space at drag start.
  const snapCentroidLocal = useRef<THREE.Vector3>(new THREE.Vector3());
  // Pivot world matrix at drag start.
  const snapPivotWorld = useRef<THREE.Matrix4>(new THREE.Matrix4());

  // Compute centroid of selected vertices in world space.
  const centroidWorld = useMemo(() => {
    const positions = getPositions(mesh.geometry);
    if (selectedElements.length === 0) return null;
    const vis = selectedVertexIndices(selectedElements, mesh.geometry);
    if (vis.size === 0) return null;
    const c = new THREE.Vector3();
    for (const vi of vis) {
      c.x += positions[vi * 3];
      c.y += positions[vi * 3 + 1];
      c.z += positions[vi * 3 + 2];
    }
    c.divideScalar(vis.size);
    return c.applyMatrix4(mesh.matrixWorld);
  }, [mesh, selectedElements]);

  // Keep pivot at centroid whenever selection or geometry changes (outside drag).
  useEffect(() => {
    if (centroidWorld) {
      pivotRef.current.position.copy(centroidWorld);
      pivotRef.current.rotation.set(0, 0, 0);
      pivotRef.current.scale.set(1, 1, 1);
      pivotRef.current.updateMatrix();
      pivotRef.current.updateMatrixWorld(true);
    }
  }, [centroidWorld]);

  const handleMouseDown = useCallback(() => {
    // Snapshot: vertex positions and centroid in local space.
    // Expand selection to include co-located vertices so split-vertex
    // geometries (BoxGeometry etc.) move as a connected surface.
    const positions = getPositions(mesh.geometry);
    const vis = expandToColocated(
      selectedVertexIndices(selectedElements, mesh.geometry),
      positions,
    );
    snapPositions.current.clear();
    const localCentroid = new THREE.Vector3();
    for (const vi of vis) {
      const lp = new THREE.Vector3(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]);
      snapPositions.current.set(vi, lp.clone());
      localCentroid.add(lp);
    }
    if (vis.size > 0) localCentroid.divideScalar(vis.size);
    snapCentroidLocal.current.copy(localCentroid);
    snapPivotWorld.current.copy(pivotRef.current.matrixWorld);
    onTransformStart();
  }, [mesh, selectedElements, onTransformStart]);

  const handleChange = useCallback(() => {
    const pivot = pivotRef.current;
    pivot.updateMatrix();
    pivot.updateMatrixWorld(true);

    const invMeshWorld = new THREE.Matrix4().copy(mesh.matrixWorld).invert();

    // Current pivot world matrix relative to its start: delta = current * inverse(snap)
    const delta = new THREE.Matrix4().multiplyMatrices(
      pivot.matrixWorld,
      new THREE.Matrix4().copy(snapPivotWorld.current).invert(),
    );

    const positions = getPositions(mesh.geometry);
    const vis = new Set(snapPositions.current.keys());

    for (const vi of vis) {
      const snap = snapPositions.current.get(vi);
      if (!snap) continue;

      // Convert snapped local position to world space.
      const worldPt = snap.clone().applyMatrix4(mesh.matrixWorld);
      // Apply the pivot delta in world space.
      worldPt.applyMatrix4(delta);
      // Convert back to mesh local space.
      worldPt.applyMatrix4(invMeshWorld);

      positions[vi * 3] = worldPt.x;
      positions[vi * 3 + 1] = worldPt.y;
      positions[vi * 3 + 2] = worldPt.z;
    }

    flushPositions(mesh.geometry, positions);
  }, [mesh, selectedElements]);

  const handleMouseUp = useCallback(() => {
    onTransformEnd();
    sceneActions.invalidate();
  }, [onTransformEnd]);

  if (!centroidWorld || selectedElements.length === 0) return null;

  return (
    <>
      {/* Invisible pivot object — TransformControls attaches to this */}
      <group ref={pivotRef} />
      <TransformControls
        object={pivotRef}
        mode={transformMode}
        {...resolveSnapProps(snap, ctrlHeld)}
        onMouseDown={handleMouseDown}
        onObjectChange={handleChange}
        onMouseUp={handleMouseUp}
      />
    </>
  );
}
