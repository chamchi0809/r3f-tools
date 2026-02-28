/**
 * ModelingOverlay.tsx
 *
 * R3F component rendered inside the Canvas when Modeling Mode is active.
 * Responsibilities:
 *   - Renders vertex/edge/face highlight spheres/lines over the selected mesh
 *   - Handles pointer events: click to select, Shift+click for additive
 *   - TransformControls gizmo (translate/rotate/scale) on selection centroid
 *   - G/R/S hotkeys to switch transform mode; Tab exits to Object Mode
 */
import { TransformControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useRef, useMemo, useCallback, useState } from "react";
import * as THREE from "three/webgpu";
import { useSceneStore, sceneActions } from "../store/sceneStore";
import {
  useModelingStore,
  modelingActions,
  type SelectionMode,
  type SelectedElement,
  type ModelingTransformMode,
} from "../store/modelingStore";
import { useSettingsStore, resolveSnapProps } from "../store/settingsStore";

// ─── Constants ────────────────────────────────────────────────────────────────

const VERTEX_RADIUS = 0.04;
const VERTEX_HIT_RADIUS = 0.12;           // invisible hit sphere — 3× visual for forgiving clicks
const VERTEX_SCREEN_HIT_PX = 24;          // screen-space hover threshold (pixels)
const VERTEX_COLOR_DEFAULT = "#888888";
const VERTEX_COLOR_HOVERABLE = "#44aaff"; // within cursor reach but not yet clicked
const VERTEX_COLOR_SELECTED = "#f0a020";
const EDGE_COLOR_DEFAULT = "#555555";
const EDGE_COLOR_SELECTED = "#f0a020";
const EDGE_HIT_RADIUS = 0.06;
const FACE_COLOR_DEFAULT = new THREE.Color(0x3399ff).multiplyScalar(0.15);
const FACE_COLOR_SELECTED = new THREE.Color(0xf0a020).multiplyScalar(0.4);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPositions(geo: THREE.BufferGeometry): Float32Array {
  const attr = geo.getAttribute("position");
  if (!attr) return new Float32Array(0);
  return attr.array as Float32Array;
}

function getIndices(geo: THREE.BufferGeometry): number[] | null {
  const idx = geo.getIndex();
  if (!idx) return null;
  return Array.from(idx.array as Uint32Array);
}

/** Build a cylinder geometry between two points for edge hit detection */
function makeCylinderGeometry(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
): THREE.BufferGeometry {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const cylinder = new THREE.CylinderGeometry(radius, radius, length, 8, 1);
  // Orient cylinder (default is Y-up) to point from a to b
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  cylinder.applyQuaternion(quaternion);
  // Position cylinder at midpoint
  const midpoint = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  cylinder.translate(midpoint.x, midpoint.y, midpoint.z);
  return cylinder;
}

/** Rebuild the position BufferAttribute in place and mark needsUpdate.
 *  Also keeps normal/uv stubs sized to match (required by WebGPU node shaders). */
function flushPositions(geo: THREE.BufferGeometry, positions: Float32Array): void {
  const vertCount = positions.length / 3;
  const existing = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (existing && existing.array.length === positions.length) {
    existing.set(positions);
    existing.needsUpdate = true;
  } else {
    // Vertex count changed — replace the attribute entirely
    geo.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
    // Resize normal/uv stubs to match new vertex count
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(vertCount * 2), 2));
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.userData.r3eEdited = true;
  geo.computeBoundingSphere();
}

/** Collect the unique set of vertex indices covered by a selection. */
function selectedVertexIndices(
  elements: SelectedElement[],
  geo: THREE.BufferGeometry,
): Set<number> {
  const indices = getIndices(geo);
  const set = new Set<number>();
  for (const el of elements) {
    if (el.type === "vertex") {
      set.add(el.index);
    } else if (el.type === "edge") {
      set.add(el.index);
      if (el.index2 !== undefined) set.add(el.index2);
    } else if (el.type === "face") {
      if (indices) {
        set.add(indices[el.index * 3]);
        set.add(indices[el.index * 3 + 1]);
        set.add(indices[el.index * 3 + 2]);
      } else {
        set.add(el.index * 3);
        set.add(el.index * 3 + 1);
        set.add(el.index * 3 + 2);
      }
    }
  }
  return set;
}

/**
 * Expand a set of vertex indices to include ALL position-buffer entries that
 * are co-located (within epsilon) with any vertex already in the set.
 *
 * This is required for geometries like BoxGeometry that store split vertices
 * (duplicate XYZ entries per face for per-face normals). Without this,
 * moving a face only shifts one copy of each corner, tearing adjacent faces.
 */
function expandToColocated(baseSet: Set<number>, positions: Float32Array, eps = 1e-5): Set<number> {
  const n = positions.length / 3;
  const expanded = new Set<number>(baseSet);
  // Collect world positions of the base set
  const basePositions: Array<{ x: number; y: number; z: number }> = [];
  for (const vi of baseSet) {
    basePositions.push({
      x: positions[vi * 3],
      y: positions[vi * 3 + 1],
      z: positions[vi * 3 + 2],
    });
  }
  const eps2 = eps * eps;
  for (let i = 0; i < n; i++) {
    if (expanded.has(i)) continue;
    const ix = positions[i * 3],
      iy = positions[i * 3 + 1],
      iz = positions[i * 3 + 2];
    for (const bp of basePositions) {
      const dx = ix - bp.x,
        dy = iy - bp.y,
        dz = iz - bp.z;
      if (dx * dx + dy * dy + dz * dz < eps2) {
        expanded.add(i);
        break;
      }
    }
  }
  return expanded;
}

// ─── Vertex hover gizmo ───────────────────────────────────────────────────────

/**
 * Camera-facing ring rendered at the hovered vertex's WORLD position (outside
 * the local-space mesh group). Scales each frame so its screen-space radius
 * always matches VERTEX_SCREEN_HIT_PX, giving the user clear visual feedback
 * about how large the selection zone is.
 */
function VertexHoverGizmo({
  position,
  isSelected,
}: {
  position: THREE.Vector3;
  isSelected: boolean;
}) {
  const { camera, size } = useThree();
  const ref = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    // Billboard: orient ring to always face the camera
    m.quaternion.copy(camera.quaternion);
    // Scale so the ring's radius equals VERTEX_SCREEN_HIT_PX pixels at any distance
    const dist = camera.position.distanceTo(position);
    const fovRad = ((camera as THREE.PerspectiveCamera).fov ?? 60) * (Math.PI / 180);
    const worldRadius = (VERTEX_SCREEN_HIT_PX * dist * 2 * Math.tan(fovRad / 2)) / size.height;
    m.scale.setScalar(worldRadius);
  });

  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[0.72, 1.0, 32]} />
      <meshBasicMaterial
        color={isSelected ? VERTEX_COLOR_SELECTED : VERTEX_COLOR_HOVERABLE}
        transparent
        opacity={0.65}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ─── Vertex dots ──────────────────────────────────────────────────────────────

/**
 * Renders visual spheres for every vertex plus a larger invisible hit sphere
 * (3× radius) for a more forgiving click target.
 *
 * Hover state is driven by per-frame screen-space proximity detection instead
 * of Three.js raycasting, so it works at any zoom level.
 */
function VertexDots({
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

// ─── Edge lines ───────────────────────────────────────────────────────────────

function EdgeLines({
  mesh,
  selectedElements,
  selectionMode,
  onClick,
}: {
  mesh: THREE.Mesh;
  selectedElements: SelectedElement[];
  selectionMode: SelectionMode;
  onClick: (a: number, b: number, additive: boolean) => void;
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

  if (selectionMode !== "edge") return null;

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
            onClick(a, b, e.shiftKey);
          }}
        >
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </>
  );
}

// ─── Face overlays ────────────────────────────────────────────────────────────

function FaceOverlays({
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

// ─── Selection Transform Gizmo ────────────────────────────────────────────────

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
function SelectionTransformGizmo({
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

// ─── Bounding box gizmo ────────────────────────────────────────────────────────

/**
 * SketchUp-style bounding box: renders 12 wire-frame edges around the selected
 * mesh (world-space AABB) and three DOM labels anchored to the midpoints of the
 * W, H, and D edges. Labels are projected to screen space every frame so they
 * stay attached as the camera orbits.
 */
function BoundingBoxGizmo({ mesh }: { mesh: THREE.Mesh }) {
  const { camera, size, gl } = useThree();

  // Stable line geometry — 12 edges × 2 vertices = 24 points = 72 floats.
  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(72), 3));
    return geo;
  }, []);
  useEffect(() => () => lineGeo.dispose(), [lineGeo]);

  // Three DOM labels (W, H, D) — created once, positioned every frame.
  const labelsRef = useRef<HTMLDivElement[]>([]);
  useEffect(() => {
    const COLORS = ["#ff8888", "#88ee99", "#88aaff"];
    const divs = COLORS.map((color) => {
      const div = document.createElement("div");
      Object.assign(div.style, {
        position: "fixed",
        zIndex: "9999",
        pointerEvents: "none",
        transform: "translate(-50%, -50%)",
        background: "rgba(0,0,0,0.72)",
        border: `1px solid ${color}66`,
        borderRadius: "3px",
        padding: "1px 6px",
        fontFamily: "monospace",
        fontSize: "11px",
        color,
        userSelect: "none",
        whiteSpace: "nowrap",
      });
      document.body.appendChild(div);
      return div;
    });
    labelsRef.current = divs;
    return () => divs.forEach((d) => document.body.removeChild(d));
  }, []);

  useFrame(() => {
    // precise=true reads the position buffer directly instead of the cached
    // boundingBox, so edits made via flushPositions are reflected immediately.
    const box = new THREE.Box3().setFromObject(mesh, true);
    if (box.isEmpty()) return;
    const { min, max } = box;
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;

    // 8 corners (front face = minZ, back face = maxZ)
    const C: [number, number, number][] = [
      [min.x, min.y, min.z], // 0 front-bottom-left
      [max.x, min.y, min.z], // 1 front-bottom-right
      [max.x, max.y, min.z], // 2 front-top-right
      [min.x, max.y, min.z], // 3 front-top-left
      [min.x, min.y, max.z], // 4 back-bottom-left
      [max.x, min.y, max.z], // 5 back-bottom-right
      [max.x, max.y, max.z], // 6 back-top-right
      [min.x, max.y, max.z], // 7 back-top-left
    ];
    // 12 edges
    const E = [0,1, 1,2, 2,3, 3,0, 4,5, 5,6, 6,7, 7,4, 0,4, 1,5, 2,6, 3,7];
    const pts = new Float32Array(72);
    for (let i = 0; i < E.length; i += 2) {
      pts.set(C[E[i]], (i / 2) * 6);
      pts.set(C[E[i + 1]], (i / 2) * 6 + 3);
    }
    const attr = lineGeo.getAttribute("position") as THREE.BufferAttribute;
    attr.set(pts);
    attr.needsUpdate = true;

    // Midpoints of the three edges emanating from corner 0 (front-bottom-left).
    const midpoints = [
      new THREE.Vector3(cx,    min.y, min.z), // W: bottom-front edge
      new THREE.Vector3(min.x, cy,    min.z), // H: front-left vertical
      new THREE.Vector3(min.x, min.y, cz   ), // D: left-bottom depth edge
    ];
    const values = [max.x - min.x, max.y - min.y, max.z - min.z];
    const labels = ["W", "H", "D"];
    const rect = gl.domElement.getBoundingClientRect();
    const vw = size.width, vh = size.height;

    labelsRef.current.forEach((div, i) => {
      const ndc = midpoints[i].clone().project(camera);
      if (ndc.z > 1) { div.style.display = "none"; return; }
      div.style.display = "";
      div.style.left = `${rect.left + (ndc.x * 0.5 + 0.5) * vw}px`;
      div.style.top  = `${rect.top  + (1 - (ndc.y * 0.5 + 0.5)) * vh}px`;
      div.textContent = `${labels[i]} ${values[i].toFixed(2)}`;
    });
  });

  return (
    <lineSegments geometry={lineGeo}>
      <lineBasicMaterial color="#6699ff" transparent opacity={0.55} depthTest={false} />
    </lineSegments>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────────────────

export function ModelingOverlay(): React.JSX.Element | null {
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const objects = useSceneStore((s) => s.objects);
  const version = useSceneStore((s) => s.version);
  const selectedElements = useModelingStore((s) => s.selectedElements);
  const selectionMode = useModelingStore((s) => s.selectionMode);
  const transformMode = useModelingStore((s) => s.transformMode);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [hoveredVertexIdx, setHoveredVertexIdx] = useState<number | null>(null);

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

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Tab") {
        e.preventDefault();
        modelingActions.setEditorMode("object");
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
        />
        <FaceOverlays
          mesh={mesh}
          selectedElements={selectedElements}
          selectionMode={selectionMode}
          onClick={handleFaceClick}
        />
      </group>
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
