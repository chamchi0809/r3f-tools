import React, { useMemo, useEffect } from "react";
import * as THREE from "three/webgpu";
import type { SelectionMode, SelectedElement } from "../../../store/modelingStore";
import { useSceneStore } from "../../../store/sceneStoreState";
import { EDGE_COLOR_DEFAULT, EDGE_COLOR_SELECTED, EDGE_HIT_RADIUS } from "./constants";
import { getPositions, getIndices, makeCylinderGeometry } from "./helpers";

// CylinderGeometry(r, r, h, 8, 1) always produces exactly 32 triangles:
// sides: 8 quads × 2 = 16, top cap: 8, bottom cap: 8 → total: 32
const TRI_PER_CYLINDER = 32;

export function EdgeLines({
  mesh,
  selectedElements,
  selectionMode,
  onClick,
  addMode = false,
  onAddVertex,
  onAddVertexHover,
}: {
  mesh: THREE.Mesh;
  selectedElements: SelectedElement[];
  selectionMode: SelectionMode;
  onClick: (a: number, b: number, additive: boolean) => void;
  addMode?: boolean;
  onAddVertex?: (a: number, b: number, point: THREE.Vector3) => void;
  onAddVertexHover?: (a: number, b: number, point: THREE.Vector3 | null) => void;
}) {
  const version = useSceneStore((s) => s.version);
  const positions = getPositions(mesh.geometry);
  const indices = getIndices(mesh.geometry);

  const edgeSet = useMemo(() => {
    const edges: Array<[number, number]> = [];
    if (indices) {
      for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t],
          b = indices[t + 1],
          c = indices[t + 2];
        edges.push([Math.min(a, b), Math.max(a, b)]);
        edges.push([Math.min(b, c), Math.max(b, c)]);
        edges.push([Math.min(a, c), Math.max(a, c)]);
      }
    } else {
      const count = positions.length / 3;
      for (let t = 0; t < count; t += 3) {
        edges.push([t, t + 1], [t + 1, t + 2], [t, t + 2]);
      }
    }
    const seen = new Set<string>();
    return edges.filter(([a, b]) => {
      const key = `${a}_${b}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [positions, indices, version]);

  const selectedEdgeKeys = useMemo(
    () =>
      new Set(
        selectedElements.filter((e) => e.type === "edge").map((e) => `${e.index}_${e.index2}`),
      ),
    [selectedElements],
  );

  /**
   * Merged visual geometries: one for default-colour edges, one for selected-colour edges.
   * Never creates BufferGeometry inside render — WebGPU would rebuild GPU buffers every frame.
   */
  const { defaultGeo, selectedGeo } = useMemo(() => {
    const defPts: number[] = [];
    const selPts: number[] = [];
    for (const [a, b] of edgeSet) {
      const ax = positions[a * 3],
        ay = positions[a * 3 + 1],
        az = positions[a * 3 + 2];
      const bx = positions[b * 3],
        by = positions[b * 3 + 1],
        bz = positions[b * 3 + 2];
      if (selectedEdgeKeys.has(`${a}_${b}`)) {
        selPts.push(ax, ay, az, bx, by, bz);
      } else {
        defPts.push(ax, ay, az, bx, by, bz);
      }
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(defPts), 3));
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(selPts), 3));
    return { defaultGeo: dGeo, selectedGeo: sGeo };
  }, [edgeSet, positions, selectedEdgeKeys]);

  // Dispose visual geometries when they change
  useEffect(() => () => { defaultGeo.dispose(); selectedGeo.dispose(); }, [defaultGeo, selectedGeo]);

  /**
   * Single merged hit geometry for all edges — one scene object instead of N.
   *
   * Each edge cylinder is unrolled into a flat (non-indexed) triangle buffer.
   * Since CylinderGeometry(r, r, h, 8, 1) always has TRI_PER_CYLINDER=32 triangles
   * regardless of length or orientation, edge `i` occupies face indices
   * [i*32, (i+1)*32). We recover edgeIdx = Math.floor(faceIndex / TRI_PER_CYLINDER).
   */
  const hitGeo = useMemo(() => {
    if (edgeSet.length === 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
      return g;
    }

    // Each cylinder contributes TRI_PER_CYLINDER triangles × 3 vertices × 3 floats
    const floatsPerCylinder = TRI_PER_CYLINDER * 3 * 3;
    const allVerts = new Float32Array(edgeSet.length * floatsPerCylinder);
    let offset = 0;

    for (const [a, b] of edgeSet) {
      const va = new THREE.Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]);
      const vb = new THREE.Vector3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
      const cyl = makeCylinderGeometry(va, vb, EDGE_HIT_RADIUS);

      // Unroll indexed cylinder into flat triangle list
      const posAttr = cyl.getAttribute("position") as THREE.BufferAttribute;
      const idxAttr = cyl.getIndex()!;
      for (let i = 0; i < idxAttr.count; i++) {
        const vi = idxAttr.getX(i);
        allVerts[offset++] = posAttr.getX(vi);
        allVerts[offset++] = posAttr.getY(vi);
        allVerts[offset++] = posAttr.getZ(vi);
      }
      cyl.dispose();
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(allVerts, 3));
    return g;
  }, [edgeSet, positions]);

  // Dispose hit geometry when it changes
  useEffect(() => () => { hitGeo.dispose(); }, [hitGeo]);

  if (selectionMode !== "edge" && !addMode) return null;

  return (
    <>
      <lineSegments geometry={defaultGeo}>
        <lineBasicMaterial color={EDGE_COLOR_DEFAULT} depthTest={false} />
      </lineSegments>
      <lineSegments geometry={selectedGeo}>
        <lineBasicMaterial color={EDGE_COLOR_SELECTED} depthTest={false} linewidth={3} />
      </lineSegments>
      {/* Single hit mesh for all edges — faceIndex maps back to edge via TRI_PER_CYLINDER */}
      <mesh
        geometry={hitGeo}
        onClick={(e) => {
          e.stopPropagation();
          const fi = e.faceIndex;
          if (fi == null) return;
          const edgeIdx = Math.floor(fi / TRI_PER_CYLINDER);
          if (edgeIdx >= edgeSet.length) return;
          const [a, b] = edgeSet[edgeIdx];
          if (addMode) {
            onAddVertex?.(a, b, e.point);
          } else {
            onClick(a, b, e.shiftKey);
          }
        }}
        onPointerMove={addMode ? (e) => {
          e.stopPropagation();
          const fi = e.faceIndex;
          if (fi == null) return;
          const edgeIdx = Math.floor(fi / TRI_PER_CYLINDER);
          if (edgeIdx >= edgeSet.length) return;
          const [a, b] = edgeSet[edgeIdx];
          onAddVertexHover?.(a, b, e.point);
        } : undefined}
        onPointerLeave={addMode ? (e) => {
          e.stopPropagation();
          onAddVertexHover?.(0, 0, null);
        } : undefined}
      >
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
}
