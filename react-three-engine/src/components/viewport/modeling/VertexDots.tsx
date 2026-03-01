import { useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useRef, useMemo } from "react";
import * as THREE from "three/webgpu";
import type { SelectionMode, SelectedElement } from "../../../store/modelingStore";
import {
  VERTEX_RADIUS,
  VERTEX_HIT_RADIUS,
  VERTEX_SCREEN_HIT_PX,
  VERTEX_COLOR_DEFAULT,
  VERTEX_COLOR_HOVERABLE,
  VERTEX_COLOR_SELECTED,
} from "./constants";
import { getPositions } from "./helpers";

/**
 * Renders visual spheres for every vertex plus a larger invisible hit sphere
 * (3× radius) for a more forgiving click target.
 *
 * Hover state is driven by per-frame screen-space proximity detection instead
 * of Three.js raycasting, so it works at any zoom level.
 */
export function VertexDots({
  mesh,
  selectedElements,
  selectionMode,
  onHover,
  onClick,
}: {
  mesh: THREE.Mesh;
  selectedElements: SelectedElement[];
  selectionMode: SelectionMode;
  onHover: (idx: number | null) => void;
  onClick: (idx: number, additive: boolean) => void;
}) {
  const { camera, size, gl } = useThree();
  const positions = getPositions(mesh.geometry);
  const count = positions.length / 3;

  const selectedSet = useMemo(
    () => new Set(selectedElements.filter((e) => e.type === "vertex").map((e) => e.index)),
    [selectedElements],
  );

  // Always-current ref so useFrame can read selectedSet without stale closures
  const selectedSetRef = useRef(selectedSet);
  selectedSetRef.current = selectedSet;

  // Direct refs to visual meshes — colors are updated in useFrame, not via React state
  const visualMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const hoveredIdxRef = useRef<number | null>(null);
  const mouseNDC = useRef(new THREE.Vector2(-10, -10));

  // Reusable vectors to avoid per-frame heap allocations
  const _wp = useRef(new THREE.Vector3());
  const _ndc = useRef(new THREE.Vector3());

  // Pre-built Color objects (avoid per-frame allocation)
  const C_DEFAULT = useMemo(() => new THREE.Color(VERTEX_COLOR_DEFAULT), []);
  const C_HOVER = useMemo(() => new THREE.Color(VERTEX_COLOR_HOVERABLE), []);
  const C_SELECT = useMemo(() => new THREE.Color(VERTEX_COLOR_SELECTED), []);

  // Sync material colors whenever the selection set changes
  useEffect(() => {
    for (let i = 0; i < visualMeshRefs.current.length; i++) {
      const m = visualMeshRefs.current[i];
      if (!m) continue;
      const mat = m.material as THREE.MeshBasicMaterial;
      if (selectedSet.has(i)) {
        mat.color.copy(C_SELECT);
      } else if (hoveredIdxRef.current === i) {
        mat.color.copy(C_HOVER);
      } else {
        mat.color.copy(C_DEFAULT);
      }
    }
  }, [selectedSet, C_DEFAULT, C_HOVER, C_SELECT]);

  // Reset hover visuals when switching away from vertex/edge mode
  useEffect(() => {
    if (selectionMode !== "vertex" && selectionMode !== "edge") {
      const prev = hoveredIdxRef.current;
      if (prev !== null) {
        const m = visualMeshRefs.current[prev];
        if (m && !selectedSetRef.current.has(prev)) {
          (m.material as THREE.MeshBasicMaterial).color.copy(C_DEFAULT);
        }
        hoveredIdxRef.current = null;
        onHover(null);
      }
    }
  }, [selectionMode, C_DEFAULT, onHover]);

  // Track mouse in NDC space
  useEffect(() => {
    const canvas = gl.domElement;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseNDC.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    canvas.addEventListener("pointermove", onMove, { passive: true });
    return () => canvas.removeEventListener("pointermove", onMove);
  }, [gl]);

  // Per-frame screen-space proximity detection
  useFrame(() => {
    if (selectionMode !== "vertex" && selectionMode !== "edge") return;
    if (count === 0) return;

    const w = size.width;
    const h = size.height;
    const mx = (mouseNDC.current.x * 0.5 + 0.5) * w;
    const my = (1 - (mouseNDC.current.y * 0.5 + 0.5)) * h;

    const wp = _wp.current;
    const ndc = _ndc.current;
    let bestDist = VERTEX_SCREEN_HIT_PX;
    let bestIdx: number | null = null;

    for (let i = 0; i < count; i++) {
      wp.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).applyMatrix4(
        mesh.matrixWorld,
      );
      ndc.copy(wp).project(camera);
      if (ndc.z > 1) continue; // behind near clipping plane
      const sx = (ndc.x * 0.5 + 0.5) * w;
      const sy = (1 - (ndc.y * 0.5 + 0.5)) * h;
      const dist = Math.hypot(sx - mx, sy - my);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (hoveredIdxRef.current !== bestIdx) {
      // Restore previous hovered vertex to its correct color
      const prev = hoveredIdxRef.current;
      if (prev !== null) {
        const m = visualMeshRefs.current[prev];
        if (m) {
          (m.material as THREE.MeshBasicMaterial).color.copy(
            selectedSetRef.current.has(prev) ? C_SELECT : C_DEFAULT,
          );
        }
      }
      // Apply hover color to newly hovered vertex (don't override selected)
      if (bestIdx !== null) {
        const m = visualMeshRefs.current[bestIdx];
        if (m && !selectedSetRef.current.has(bestIdx)) {
          (m.material as THREE.MeshBasicMaterial).color.copy(C_HOVER);
        }
      }
      hoveredIdxRef.current = bestIdx;
      onHover(bestIdx);
    }
  });

  if (selectionMode !== "vertex" && selectionMode !== "edge") return null;

  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        const isSelected = selectedSet.has(i);
        return (
          <group key={i} position={[x, y, z]}>
            {/* Visual sphere: small dot, color managed by useFrame */}
            <mesh
              ref={(el) => {
                visualMeshRefs.current[i] = el;
              }}
            >
              <sphereGeometry args={[VERTEX_RADIUS, 8, 8]} />
              <meshBasicMaterial
                color={isSelected ? VERTEX_COLOR_SELECTED : VERTEX_COLOR_DEFAULT}
                depthTest={false}
              />
            </mesh>
            {/* Invisible hit sphere: 3× larger for a forgiving click target */}
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onClick(i, e.shiftKey);
              }}
            >
              <sphereGeometry args={[VERTEX_HIT_RADIUS, 6, 6]} />
              <meshBasicMaterial visible={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
