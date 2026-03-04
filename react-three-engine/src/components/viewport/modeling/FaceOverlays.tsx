import React, { useMemo, useEffect } from "react";
import * as THREE from "three/webgpu";
import type { SelectionMode, SelectedElement } from "../../../store/modelingStore";
import { useSceneStore } from "../../../store/sceneStore";
import { FACE_COLOR_DEFAULT, FACE_COLOR_SELECTED } from "./constants";
import { getPositions, getIndices } from "./helpers";

export function FaceOverlays({
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
  onClick: (faceIdx: number, additive: boolean) => void;
  addMode?: boolean;
  onAddVertex?: (faceIdx: number, point: THREE.Vector3) => void;
  onAddVertexHover?: (faceIdx: number, point: THREE.Vector3 | null) => void;
}) {
  const version = useSceneStore((s) => s.version);
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
  }, [positions, indices, version]);

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

  // Dispose visual geometries when they change
  useEffect(() => () => { defaultGeo.dispose(); selectedGeo.dispose(); }, [defaultGeo, selectedGeo]);

  /**
   * Single merged hit geometry for all faces — one scene object instead of N.
   * Laid out as a flat (non-indexed) buffer: face fi occupies vertices [fi*3, fi*3+1, fi*3+2].
   * Three.js sets faceIndex = triangle index = fi, so we can identify which face was clicked
   * directly from e.faceIndex without maintaining N separate mesh objects.
   */
  const hitGeo = useMemo(() => {
    const pts = new Float32Array(faces.length * 9);
    for (let fi = 0; fi < faces.length; fi++) {
      const [a, b, c] = faces[fi];
      const base = fi * 9;
      pts[base + 0] = positions[a * 3];     pts[base + 1] = positions[a * 3 + 1]; pts[base + 2] = positions[a * 3 + 2];
      pts[base + 3] = positions[b * 3];     pts[base + 4] = positions[b * 3 + 1]; pts[base + 5] = positions[b * 3 + 2];
      pts[base + 6] = positions[c * 3];     pts[base + 7] = positions[c * 3 + 1]; pts[base + 8] = positions[c * 3 + 2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    return g;
  }, [faces, positions]);

  // Dispose hit geometry when it changes
  useEffect(() => () => { hitGeo.dispose(); }, [hitGeo]);

  if (selectionMode !== "face" && !addMode) return null;

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
      {/* Single hit mesh for all faces — faceIndex identifies which triangle was clicked */}
      <mesh
        geometry={hitGeo}
        onClick={(e) => {
          e.stopPropagation();
          const fi = e.faceIndex;
          if (fi == null) return;
          if (addMode) {
            onAddVertex?.(fi, e.point);
          } else {
            onClick(fi, e.shiftKey);
          }
        }}
        onPointerMove={addMode ? (e) => {
          e.stopPropagation();
          const fi = e.faceIndex;
          if (fi != null) onAddVertexHover?.(fi, e.point);
        } : undefined}
        onPointerLeave={addMode ? (e) => {
          e.stopPropagation();
          onAddVertexHover?.(0, null);
        } : undefined}
      >
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}
