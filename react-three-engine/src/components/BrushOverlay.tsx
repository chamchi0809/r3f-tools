/**
 * BrushOverlay.tsx
 *
 * R3F overlay rendered inside Canvas when Brush Mode is active.
 *
 * Polygon Brush:
 *   - Click on the floor plane to place polygon vertices one by one.
 *   - A preview line follows the cursor.
 *   - Press Enter or double-click the first vertex to close & commit the polygon
 *     as a new BufferGeometry mesh in the scene.
 *   - Press Escape to cancel.
 *   - The polygon is triangulated via a simple ear-clip fan (convex hulls only;
 *     concave shapes get basic fan triangulation from vertex 0).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import { sceneActions } from "../store/sceneStore";
import { useModelingStore } from "../store/modelingStore";

// ─── Constants ────────────────────────────────────────────────────────────────

const SNAP_RADIUS_PX = 12; // pixels — snap to first vertex to close polygon
const FLOOR_Y = 0;
const POINT_COLOR = "#f0a020";
const LINE_COLOR = "#f0a020";
const PREVIEW_COLOR = "#ffffff";
const CLOSE_SNAP_COLOR = "#44ff88";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fan-triangulate a flat polygon defined by ordered XZ points (Y = FLOOR_Y). */
function triangulatePolygon(pts: THREE.Vector3[]): {
  vertices: number[];
  indices: number[];
} {
  if (pts.length < 3) return { vertices: [], indices: [] };
  const vertices: number[] = [];
  for (const p of pts) vertices.push(p.x, p.y, p.z);
  const indices: number[] = [];
  // Simple fan from vertex 0 — works for convex polygons.
  // Wind counter-clockwise so normals point UP (+Y) after computeVertexNormals
  for (let i = 1; i < pts.length - 1; i++) {
    indices.push(0, i + 1, i);
  }
  return { vertices, indices };
}

/** Project NDC → floor plane (Y = FLOOR_Y) using raycasting. */
function projectToFloor(
  ndc: THREE.Vector2,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
): THREE.Vector3 | null {
  raycaster.setFromCamera(ndc, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y);
  const hit = new THREE.Vector3();
  const result = raycaster.ray.intersectPlane(plane, hit);
  return result ? hit.clone() : null;
}

/** Return pixel distance from a world point to screen coords. */
function worldToScreenDist(
  world: THREE.Vector3,
  target: THREE.Vector2,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
): number {
  const ndc = world.clone().project(camera);
  const sx = ((ndc.x + 1) / 2) * canvas.clientWidth;
  const sy = ((1 - ndc.y) / 2) * canvas.clientHeight;
  return Math.hypot(sx - target.x, sy - target.y);
}

// ─── Preview line geometry (follows cursor) ───────────────────────────────────

function PreviewLine({
  points,
  cursor,
  closingSnap,
}: {
  points: THREE.Vector3[];
  cursor: THREE.Vector3 | null;
  closingSnap: boolean;
}) {
  const geo = useMemo(() => {
    if (points.length === 0 || !cursor) return null;
    const last = points[points.length - 1];
    const end = closingSnap ? points[0] : cursor;
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([last.x, last.y, last.z, end.x, end.y, end.z]),
        3,
      ),
    );
    return g;
  }, [points, cursor, closingSnap]);

  if (!geo) return null;
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial
        color={closingSnap ? CLOSE_SNAP_COLOR : PREVIEW_COLOR}
        depthTest={false}
        transparent
        opacity={0.8}
      />
    </lineSegments>
  );
}

// ─── Committed edge lines ─────────────────────────────────────────────────────

function CommittedLines({ points }: { points: THREE.Vector3[] }) {
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const pts: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      pts.push(
        points[i].x, points[i].y, points[i].z,
        points[i + 1].x, points[i + 1].y, points[i + 1].z,
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, [points]);

  if (!geo) return null;
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={LINE_COLOR} depthTest={false} />
    </lineSegments>
  );
}

// ─── Vertex dots ──────────────────────────────────────────────────────────────

function VertexDots({ points }: { points: THREE.Vector3[] }) {
  return (
    <>
      {points.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial
            color={i === 0 ? CLOSE_SNAP_COLOR : POINT_COLOR}
            depthTest={false}
          />
        </mesh>
      ))}
    </>
  );
}

// ─── Main brush overlay ───────────────────────────────────────────────────────

export function BrushOverlay(): React.JSX.Element | null {
  const brushType = useModelingStore((s) => s.brushType);
  const { camera, gl } = useThree();
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  const [cursor, setCursor] = useState<THREE.Vector3 | null>(null);
  const [closingSnap, setClosingSnap] = useState(false);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const cursorScreenRef = useRef<THREE.Vector2>(new THREE.Vector2());

  /** Commit the current polygon as a new mesh. */
  const commitPolygon = useCallback((pts: THREE.Vector3[]) => {
    if (pts.length < 3) return;
    const { vertices, indices } = triangulatePolygon(pts);
    if (vertices.length === 0) return;

    // Build BufferGeometry with required WebGPU attributes
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(vertices);
    const count = posArr.length / 3;
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("uv",     new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    geo.setIndex(indices);
    
    // Center geometry at polygon centroid
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);
    
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    // Add to scene as a new mesh with a default material
    // Add to scene as a new mesh with pivot at polygon center
    sceneActions.addMeshWithGeometry(geo, center);
    setPoints([]);
    setCursor(null);
    setClosingSnap(false);
  }, []);

  // Handle canvas pointer events
  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      cursorScreenRef.current.set(e.clientX - rect.left, e.clientY - rect.top);
      const hit = projectToFloor(new THREE.Vector2(ndcX, ndcY), camera, raycaster);
      setCursor(hit);

      // Check snap to first vertex
      if (hit && points.length >= 3) {
        const dist = worldToScreenDist(points[0], cursorScreenRef.current, camera, canvas);
        setClosingSnap(dist < SNAP_RADIUS_PX);
      } else {
        setClosingSnap(false);
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const hit = projectToFloor(new THREE.Vector2(ndcX, ndcY), camera, raycaster);
      if (!hit) return;

      setPoints((prev) => {
        // Snap-close check
        if (prev.length >= 3) {
          const screenPt = new THREE.Vector2(
            e.clientX - rect.left,
            e.clientY - rect.top,
          );
          const dist = worldToScreenDist(prev[0], screenPt, camera, canvas);
          if (dist < SNAP_RADIUS_PX) {
            // Close polygon
            commitPolygon(prev);
            return [];
          }
        }
        return [...prev, hit];
      });
    };

    console.log('[BrushOverlay] Setting up event listeners on canvas');
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [points, camera, gl, raycaster, commitPolygon]);

  // Keyboard: Enter to commit, Escape to cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Enter") {
        commitPolygon(points);
      } else if (e.key === "Escape") {
        setPoints([]);
        setCursor(null);
        setClosingSnap(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [points, commitPolygon]);


  // Only polygon brush is implemented for now
  if (brushType !== "polygon") return null;

  return (
    <>
      <CommittedLines points={points} />
      <VertexDots points={points} />
      <PreviewLine points={points} cursor={cursor} closingSnap={closingSnap} />
    </>
  );
}
