import { useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useRef, useMemo } from "react";
import * as THREE from "three/webgpu";
import type { SelectionMode, SelectedElement } from "../../../store/modelingStore";
import { useSceneStore } from "../../../store/sceneStore";
import {
  VERTEX_SCREEN_HIT_PX,
  VERTEX_SCREEN_VISUAL_PX,
  VERTEX_COLOR_DEFAULT,
  VERTEX_COLOR_HOVERABLE,
  VERTEX_COLOR_SELECTED,
} from "./constants";
import { getPositions } from "./helpers";

/**
 * Renders visual spheres for every vertex of a mesh.
 *
 * Uses a single InstancedMesh for O(1) draw calls regardless of vertex count.
 * Hover detection is screen-space proximity (per-frame), and clicks are fired
 * via a canvas pointerdown listener against the hovered vertex index — no
 * raycasting required.
 */
export function VertexDots({
  mesh,
  selectedElements,
  selectionMode,
  hoverGizmoRef,
  onClick,
}: {
  mesh: THREE.Mesh;
  selectedElements: SelectedElement[];
  selectionMode: SelectionMode;
  hoverGizmoRef?: React.MutableRefObject<{ pos: THREE.Vector3; isSelected: boolean } | null>;
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

  // InstancedMesh ref — one draw call for all vertices
  const visualRef = useRef<THREE.InstancedMesh>(null);

  const hoveredIdxRef = useRef<number | null>(null);
  const mouseNDC = useRef(new THREE.Vector2(-10, -10));
  const frameCounter = useRef(0);

  // Reusable vectors to avoid per-frame heap allocations
  const _wp = useRef(new THREE.Vector3());
  const _ndc = useRef(new THREE.Vector3());

  // For screen-space scale computation
  const dummyRef = useRef(new THREE.Object3D());
  const _meshCenter = useRef(new THREE.Vector3());

  // Pre-built Color objects (avoid per-frame allocation)
  const C_DEFAULT = useMemo(() => new THREE.Color(VERTEX_COLOR_DEFAULT), []);
  const C_HOVER = useMemo(() => new THREE.Color(VERTEX_COLOR_HOVERABLE), []);
  const C_SELECT = useMemo(() => new THREE.Color(VERTEX_COLOR_SELECTED), []);

  // Sync instance matrices + all colors when geometry changes (count/positions/version).
  // Does NOT depend on selectedSet so clicking a vertex doesn't trigger O(N) work.
  useEffect(() => {
    const visual = visualRef.current;
    if (!visual) return;

    const dummy = dummyRef.current;
    const sel = selectedSetRef.current;
    for (let i = 0; i < count; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).applyMatrix4(mesh.matrixWorld);
      dummy.updateMatrix();
      visual.setMatrixAt(i, dummy.matrix);
      visual.setColorAt(i, sel.has(i) ? C_SELECT : hoveredIdxRef.current === i ? C_HOVER : C_DEFAULT);
    }
    visual.instanceMatrix.needsUpdate = true;
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
        if (hoverGizmoRef) hoverGizmoRef.current = null;
      }
    }
  }, [selectionMode, C_DEFAULT, hoverGizmoRef]);

  // Keep a stable ref to the latest onClick so the pointerdown listener doesn't go stale
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  // Track mouse in NDC space + handle clicks via screen-space hover result
  useEffect(() => {
    const canvas = gl.domElement;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseNDC.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    // Use pointerdown (not click) so we beat OrbitControls' drag threshold
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const idx = hoveredIdxRef.current;
      if (idx !== null) {
        onClickRef.current(idx, e.shiftKey);
      }
    };
    canvas.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerdown", onDown);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
    };
  }, [gl]);

  // Per-frame screen-space proximity detection — throttled to every 2 frames
  useFrame(() => {
    if (selectionMode !== "vertex" && selectionMode !== "edge") return;
    if (count === 0) return;

    // Throttle: run hover detection every other frame
    frameCounter.current = (frameCounter.current + 1) % 2;
    if (frameCounter.current !== 0) return;

    // Screen-space consistent scale in world space (no mesh scale compensation needed)
    _meshCenter.current.setFromMatrixPosition(mesh.matrixWorld);
    const camDist = camera.position.distanceTo(_meshCenter.current);
    const fovRad = ((camera as THREE.PerspectiveCamera).fov ?? 60) * (Math.PI / 180);
    const worldRadius = (VERTEX_SCREEN_VISUAL_PX * camDist * 2 * Math.tan(fovRad / 2)) / size.height;

    const visual = visualRef.current;
    const d = dummyRef.current;
    const wp = _wp.current;
    if (visual) {
      for (let i = 0; i < count; i++) {
        wp.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).applyMatrix4(mesh.matrixWorld);
        d.position.copy(wp);
        d.scale.setScalar(worldRadius);
        d.updateMatrix();
        visual.setMatrixAt(i, d.matrix);
      }
      visual.instanceMatrix.needsUpdate = true;
    }

    const w = size.width;
    const h = size.height;
    const mx = (mouseNDC.current.x * 0.5 + 0.5) * w;
    const my = (1 - (mouseNDC.current.y * 0.5 + 0.5)) * h;

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
      const prev = hoveredIdxRef.current;
      if (prev !== null && visual) {
        visual.setColorAt(prev, selectedSetRef.current.has(prev) ? C_SELECT : C_DEFAULT);
      }
      if (bestIdx !== null && visual && !selectedSetRef.current.has(bestIdx)) {
        visual.setColorAt(bestIdx, C_HOVER);
      }
      if (visual?.instanceColor) visual.instanceColor.needsUpdate = true;
      hoveredIdxRef.current = bestIdx;
      if (hoverGizmoRef) {
        if (bestIdx !== null) {
          wp.set(positions[bestIdx * 3], positions[bestIdx * 3 + 1], positions[bestIdx * 3 + 2]).applyMatrix4(mesh.matrixWorld);
          hoverGizmoRef.current = {
            pos: wp.clone(),
            isSelected: selectedSetRef.current.has(bestIdx),
          };
        } else {
          hoverGizmoRef.current = null;
        }
      }
    }
  });

  if (selectionMode !== "vertex" && selectionMode !== "edge") return null;
  if (count === 0) return null;

  return (
    <>
      {/* Visual instanced mesh: one draw call for all vertex dots */}
      <instancedMesh ref={visualRef} args={[null as any, null as any, count]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial depthTest={false} />
      </instancedMesh>
    </>
  );
}
