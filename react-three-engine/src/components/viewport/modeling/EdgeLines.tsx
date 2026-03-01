import React, { useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import type { SelectionMode, SelectedElement } from "../../../store/modelingStore";
import { EDGE_COLOR_DEFAULT, EDGE_COLOR_SELECTED, EDGE_HIT_RADIUS } from "./constants";
import { getPositions, getIndices, makeCylinderGeometry } from "./helpers";

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
  }, [positions, indices]);

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

  /**
   * Per-edge click-detection geometries, cached in a ref map keyed by "a_b".
   * Rebuilt only when positions change, not every render.
   */
  const hitGeoCache = useRef<Map<string, THREE.BufferGeometry>>(new Map());
  const hitGeos = useMemo(() => {
    const cache = hitGeoCache.current;
    // Dispose stale entries
    for (const key of cache.keys()) {
      if (!edgeSet.find(([a, b]) => `${a}_${b}` === key)) {
        cache.get(key)!.dispose();
        cache.delete(key);
      }
    }
    return edgeSet.map(([a, b]) => {
      const key = `${a}_${b}`;
      const ax = positions[a * 3],
        ay = positions[a * 3 + 1],
        az = positions[a * 3 + 2];
      const bx = positions[b * 3],
        by = positions[b * 3 + 1],
        bz = positions[b * 3 + 2];
      const vecA = new THREE.Vector3(ax, ay, az);
      const vecB = new THREE.Vector3(bx, by, bz);

      let g = cache.get(key);
      if (!g) {
        g = makeCylinderGeometry(vecA, vecB, EDGE_HIT_RADIUS);
        cache.set(key, g);
      } else {
        // Rebuild if positions changed
        g.dispose();
        g = makeCylinderGeometry(vecA, vecB, EDGE_HIT_RADIUS);
        cache.set(key, g);
      }
      return { key, a, b, geo: g };
    });
  }, [edgeSet, positions]);

  if (selectionMode !== "edge" && !addMode) return null;

  return (
    <>
      <lineSegments geometry={defaultGeo}>
        <lineBasicMaterial color={EDGE_COLOR_DEFAULT} depthTest={false} />
      </lineSegments>
      <lineSegments geometry={selectedGeo}>
        <lineBasicMaterial color={EDGE_COLOR_SELECTED} depthTest={false} linewidth={3} />
      </lineSegments>
      {hitGeos.map(({ key, a, b, geo }) => (
        <mesh
          key={key}
          geometry={geo}
          onClick={(e) => {
            e.stopPropagation();
            if (addMode) {
              onAddVertex?.(a, b, e.point);
            } else {
              onClick(a, b, e.shiftKey);
            }
          }}
          onPointerMove={addMode ? (e) => { e.stopPropagation(); onAddVertexHover?.(a, b, e.point); } : undefined}
          onPointerLeave={addMode ? (e) => { e.stopPropagation(); onAddVertexHover?.(a, b, null); } : undefined}
        >
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </>
  );
}
