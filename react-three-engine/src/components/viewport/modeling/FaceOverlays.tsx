import React, { useMemo, useRef } from "react";
import * as THREE from "three/webgpu";
import type { SelectionMode, SelectedElement } from "../../../store/modelingStore";
import { FACE_COLOR_DEFAULT, FACE_COLOR_SELECTED } from "./constants";
import { getPositions, getIndices } from "./helpers";

export function FaceOverlays({
  mesh,
  selectedElements,
  selectionMode,
  onClick,
}: {
  mesh: THREE.Mesh;
  selectedElements: SelectedElement[];
  selectionMode: SelectionMode;
  onClick: (faceIdx: number, additive: boolean) => void;
}) {
  const positions = getPositions(mesh.geometry);
  const indices = getIndices(mesh.geometry);

  const faces = useMemo(() => {
    if (indices) {
      return indices.reduce<Array<[number, number, number]>>((acc, _, i) => {
        if (i % 3 === 0) acc.push([indices[i], indices[i + 1], indices[i + 2]]);
        return acc;
      }, []);
    }
    const count = positions.length / 3;
    return Array.from(
      { length: Math.floor(count / 3) },
      (_, i) => [i * 3, i * 3 + 1, i * 3 + 2] as [number, number, number],
    );
  }, [positions, indices]);

  const selectedFaceSet = useMemo(
    () => new Set(selectedElements.filter((e) => e.type === "face").map((e) => e.index)),
    [selectedElements],
  );

  /**
   * Two merged meshes: one for unselected faces, one for selected faces.
   * Never creates BufferGeometry inside render — WebGPU would rebuild GPU buffers every frame.
   */
  const { defaultGeo, selectedGeo } = useMemo(() => {
    const defPts: number[] = [];
    const defIdx: number[] = [];
    const selPts: number[] = [];
    const selIdx: number[] = [];
    faces.forEach(([a, b, c], faceIdx) => {
      const ax = positions[a * 3],
        ay = positions[a * 3 + 1],
        az = positions[a * 3 + 2];
      const bx = positions[b * 3],
        by = positions[b * 3 + 1],
        bz = positions[b * 3 + 2];
      const cx = positions[c * 3],
        cy = positions[c * 3 + 1],
        cz = positions[c * 3 + 2];
      if (selectedFaceSet.has(faceIdx)) {
        const base = selPts.length / 3;
        selPts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        selIdx.push(base, base + 1, base + 2);
      } else {
        const base = defPts.length / 3;
        defPts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        defIdx.push(base, base + 1, base + 2);
      }
    });
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(defPts), 3));
    dGeo.setIndex(defIdx);
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(selPts), 3));
    sGeo.setIndex(selIdx);
    return { defaultGeo: dGeo, selectedGeo: sGeo };
  }, [faces, positions, selectedFaceSet]);

  /**
   * Per-face hit geometries cached in a ref map keyed by face index.
   * Rebuilt only when positions/faces change, not every render.
   */
  const hitGeoCache = useRef<Map<number, THREE.BufferGeometry>>(new Map());
  const hitGeos = useMemo(() => {
    const cache = hitGeoCache.current;
    // Dispose stale entries
    for (const key of cache.keys()) {
      if (key >= faces.length) {
        cache.get(key)!.dispose();
        cache.delete(key);
      }
    }
    return faces.map(([a, b, c], faceIdx) => {
      let g = cache.get(faceIdx);
      if (!g) {
        g = new THREE.BufferGeometry();
        g.setIndex([0, 1, 2]);
        cache.set(faceIdx, g);
      }
      const ax = positions[a * 3],
        ay = positions[a * 3 + 1],
        az = positions[a * 3 + 2];
      const bx = positions[b * 3],
        by = positions[b * 3 + 1],
        bz = positions[b * 3 + 2];
      const cx = positions[c * 3],
        cy = positions[c * 3 + 1],
        cz = positions[c * 3 + 2];
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array([ax, ay, az, bx, by, bz, cx, cy, cz]), 3),
      );
      return { faceIdx, geo: g };
    });
  }, [faces, positions]);

  if (selectionMode !== "face") return null;

  return (
    <>
      <mesh geometry={defaultGeo}>
        <meshBasicMaterial
          color={FACE_COLOR_DEFAULT}
          transparent
          opacity={0.2}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={selectedGeo}>
        <meshBasicMaterial
          color={FACE_COLOR_SELECTED}
          transparent
          opacity={0.5}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {hitGeos.map(({ faceIdx, geo }) => (
        <mesh
          key={faceIdx}
          geometry={geo}
          onClick={(e) => {
            e.stopPropagation();
            onClick(faceIdx, e.shiftKey);
          }}
        >
          <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}
