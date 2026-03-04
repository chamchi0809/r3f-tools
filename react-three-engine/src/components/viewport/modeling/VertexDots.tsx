import { useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useRef, useMemo } from "react";
import * as THREE from "three/webgpu";
import type { SelectionMode, SelectedElement } from "../../../store/modelingStore";
import { useSceneStore } from "../../../store/sceneStore";
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
 * Uses InstancedMesh for O(1) draw calls regardless of vertex count.
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
  // version increments on every sceneActions.invalidate(), ensuring the
  // instance matrices are rebuilt after in-place geometry edits (e.g. vertex drag)
  // where the Float32Array reference stays the same but values change.
  const version = useSceneStore((s) => s.version);
  const positions = getPositions(mesh.geometry);
  const count = positions.length / 3;

  const selectedSet = useMemo(
    () => new Set(selectedElements.filter((e) => e.type === "vertex").map((e) => e.index)),
    [selectedElements],
  );

  const selectedSetRef = useRef(selectedSet);
  selectedSetRef.current = selectedSet;

  // InstancedMesh refs — one draw call for all vertices
  const visualRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);

  const hoveredIdxRef = useRef<number | null>(null);
  const mouseNDC = useRef(new THREE.Vector2(-10, -10));
  const frameCounter = useRef(0);

  // Reusable vectors to avoid per-frame heap allocations
  const _wp = useRef(new THREE.Vector3());
  const _ndc = useRef(new THREE.Vector3());

  // Pre-built Color objects (avoid per-frame allocation)
  const C_DEFAULT = useMemo(() => new THREE.Color(VERTEX_COLOR_DEFAULT), []);
  const C_HOVER = useMemo(() => new THREE.Color(VERTEX_COLOR_HOVERABLE), []);
  const C_SELECT = useMemo(() => new THREE.Color(VERTEX_COLOR_SELECTED), []);

  // Sync instance matrices + all colors when geometry changes (count/positions/version).
  // Does NOT depend on selectedSet so clicking a vertex doesn't trigger O(N) work.
  useEffect(() => {
    const visual = visualRef.current;
    const hit = hitRef.current;
    if (!visual || !hit) return;

    const dummy = new THREE.Object3D();
    const sel = selectedSetRef.current;
    for (let i = 0; i < count; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.updateMatrix();
      visual.setMatrixAt(i, dummy.matrix);
      hit.setMatrixAt(i, dummy.matrix);
      visual.setColorAt(i, sel.has(i) ? C_SELECT : hoveredIdxRef.current === i ? C_HOVER : C_DEFAULT);
    }
    visual.instanceMatrix.needsUpdate = true;
    hit.instanceMatrix.needsUpdate = true;
    if (visual.instanceColor) visual.instanceColor.needsUpdate = true;
  }, [count, positions, version, C_DEFAULT, C_HOVER, C_SELECT]);

  // When selection changes, only update colors for the affected instances — O(changed) not O(N).
  const prevSelectedSetRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const visual = visualRef.current;
    if (!visual?.instanceColor) return;

    const prev = prevSelectedSetRef.current;
    const curr = selectedSet;

    // Deselected: restore to hover or default color
    for (const idx of prev) {
      if (!curr.has(idx)) {
        visual.setColorAt(idx, hoveredIdxRef.current === idx ? C_HOVER : C_DEFAULT);
      }
    }
    // Newly selected
    for (const idx of curr) {
      if (!prev.has(idx)) {
        visual.setColorAt(idx, C_SELECT);
      }
    }

    prevSelectedSetRef.current = curr;
    visual.instanceColor.needsUpdate = true;
  }, [selectedSet, C_DEFAULT, C_HOVER, C_SELECT]);

  // Reset hover visuals when switching away from vertex/edge mode
  useEffect(() => {
    if (selectionMode !== "vertex" && selectionMode !== "edge") {
      const prev = hoveredIdxRef.current;
      if (prev !== null) {
        const visual = visualRef.current;
        if (visual && !selectedSetRef.current.has(prev)) {
          visual.setColorAt(prev, C_DEFAULT);
          if (visual.instanceColor) visual.instanceColor.needsUpdate = true;
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

  // Per-frame screen-space proximity detection — throttled to every 2 frames
  useFrame(() => {
    if (selectionMode !== "vertex" && selectionMode !== "edge") return;
    if (count === 0) return;

    // Throttle: run hover detection every other frame
    frameCounter.current = (frameCounter.current + 1) % 2;
    if (frameCounter.current !== 0) return;

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
      const visual = visualRef.current;
      const prev = hoveredIdxRef.current;
      if (prev !== null && visual) {
        visual.setColorAt(prev, selectedSetRef.current.has(prev) ? C_SELECT : C_DEFAULT);
      }
      if (bestIdx !== null && visual && !selectedSetRef.current.has(bestIdx)) {
        visual.setColorAt(bestIdx, C_HOVER);
      }
      if (visual?.instanceColor) visual.instanceColor.needsUpdate = true;
      hoveredIdxRef.current = bestIdx;
      onHover(bestIdx);
    }
  });

  if (selectionMode !== "vertex" && selectionMode !== "edge") return null;
  if (count === 0) return null;

  return (
    <>
      {/* Visual instanced mesh: one draw call for all vertex dots */}
      <instancedMesh ref={visualRef} args={[null as any, null as any, count]}>
        <sphereGeometry args={[VERTEX_RADIUS, 8, 8]} />
        <meshBasicMaterial depthTest={false} />
      </instancedMesh>
      {/* Hit instanced mesh: one draw call for all invisible hit spheres */}
      <instancedMesh
        ref={hitRef}
        args={[null as any, null as any, count]}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) onClick(e.instanceId, e.shiftKey);
        }}
      >
        <sphereGeometry args={[VERTEX_HIT_RADIUS, 6, 6]} />
        <meshBasicMaterial visible={false} />
      </instancedMesh>
    </>
  );
}
