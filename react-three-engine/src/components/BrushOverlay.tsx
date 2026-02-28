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
 *
 * Poly3D Brush:
 *   Phase 1 — identical to Polygon Brush: place vertices, close polygon.
 *   Phase 2 — extrude: move mouse up/down to set height; click to confirm.
 *             A live extruded preview mesh is shown. Height label is displayed
 *             as a DOM overlay near the cursor.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import { sceneActions } from "../store/sceneStore";
import { useModelingStore, modelingActions } from "../store/modelingStore";
import { useSettingsStore, snapToGrid } from "../store/settingsStore";

// ─── Constants ────────────────────────────────────────────────────────────────

const SNAP_RADIUS_PX = 12; // pixels — snap to first vertex to close polygon
const FLOOR_Y = 0;
const POINT_COLOR = "#f0a020";
const LINE_COLOR = "#f0a020";
const PREVIEW_COLOR = "#ffffff";
const CLOSE_SNAP_COLOR = "#44ff88";
const EXTRUDE_PREVIEW_COLOR = "#5588ff";
const EXTRUDE_WIRE_COLOR = "#88aaff";
const HEIGHT_SENSITIVITY = 0.01; // world units per pixel of vertical mouse movement

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Triangulate a flat polygon on XZ plane using earcut (supports concave shapes). */
function triangulatePolygon(pts: THREE.Vector3[]): {
  vertices: number[];
  indices: number[];
} {
  if (pts.length < 3) return { vertices: [], indices: [] };
  const vertices: number[] = [];
  for (const p of pts) vertices.push(p.x, p.y, p.z);

  // Earcut expects a flat array of 2D coords. We use X and Z (the floor plane).
  const rawIndices = THREE.ShapeUtils.triangulateShape(
    pts.map((p) => new THREE.Vector2(p.x, p.z)),
    [],
  );

  // rawIndices is an array of [a, b, c] triplets.
  // Determine winding on XZ via signed area — if CW, flip each triangle so
  // the front face (+Y normal) is always upward.
  let signedArea = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    signedArea += a.x * b.z - b.x * a.z;
  }
  const isCCW = signedArea > 0;

  const indices: number[] = [];
  for (const tri of rawIndices) {
    if (isCCW) {
      indices.push(tri[0], tri[1], tri[2]);
    } else {
      indices.push(tri[0], tri[2], tri[1]);
    }
  }
  return { vertices, indices };
}

/**
 * Build an extruded BufferGeometry from floor polygon points + height.
 * Returns bottom face (Y=0), top face (Y=height), and side walls.
 * The geometry is NOT centered — caller should handle pivot if needed.
 */
function buildExtrudedGeometry(pts: THREE.Vector3[], height: number): THREE.BufferGeometry {
  const n = pts.length;
  const h = Math.abs(height);
  const yTop = FLOOR_Y + (height >= 0 ? h : 0);
  const yBot = FLOOR_Y + (height >= 0 ? 0 : -h);

  // ── Bottom face (Y = yBot, normal = -Y) ────────────────────────────────────
  const bottomPts = pts.map((p) => new THREE.Vector3(p.x, yBot, p.z));
  const { indices: bottomIdx } = triangulatePolygon(bottomPts);

  // ── Top face (Y = yTop, normal = +Y) ───────────────────────────────────────
  const topPts = pts.map((p) => new THREE.Vector3(p.x, yTop, p.z));
  // Top face needs reversed winding for +Y normal
  const { indices: topIdxRaw } = triangulatePolygon(topPts);
  const topIdx = topIdxRaw.map((_, i) =>
    i % 3 === 0 ? topIdxRaw[i] : i % 3 === 1 ? topIdxRaw[i + 1] : topIdxRaw[i - 1],
  );

  // ── Side walls (2 triangles per edge) ──────────────────────────────────────
  // Vertex layout for sides: interleaved bottom/top pairs per edge vertex.
  // We build sides as a separate vertex array to keep normals flat per face.
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  // Bottom vertices
  const botBase = 0;
  for (const p of bottomPts) positions.push(p.x, p.y, p.z);
  // Top vertices
  const topBase = n;
  for (const p of topPts) positions.push(p.x, p.y, p.z);

  // Bottom face indices (reversed for -Y outward normal from CCW pts)
  for (let i = 0; i < bottomIdx.length; i += 3) {
    indices.push(botBase + bottomIdx[i + 2], botBase + bottomIdx[i + 1], botBase + bottomIdx[i]);
  }
  // Top face indices
  for (let i = 0; i < topIdx.length; i++) {
    indices.push(topBase + topIdx[i]);
  }

  // Side walls — for each edge we emit 4 new vertices with flat face normals
  const sideBase = positions.length / 3;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const b0 = bottomPts[i];
    const b1 = bottomPts[j];
    const t0 = topPts[i];
    const t1 = topPts[j];

    // Outward normal for this wall segment (XZ edge perpendicular, +Y=0)
    const edge = new THREE.Vector3(b1.x - b0.x, 0, b1.z - b0.z);
    const norm = new THREE.Vector3(-edge.z, 0, edge.x).normalize();

    const vi = sideBase + i * 4;
    // b0, b1, t1, t0 — CCW from outside
    positions.push(b0.x, b0.y, b0.z);
    positions.push(b1.x, b1.y, b1.z);
    positions.push(t1.x, t1.y, t1.z);
    positions.push(t0.x, t0.y, t0.z);
    for (let k = 0; k < 4; k++) normals.push(norm.x, norm.y, norm.z);
    // Two triangles: vi, vi+1, vi+2 and vi, vi+2, vi+3
    indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
  }

  // Fill normals for top/bottom vertices (placeholder — computed below)
  const totalVerts = positions.length / 3;
  const finalNormals = new Float32Array(totalVerts * 3);
  // bottom face normals: -Y
  for (let i = 0; i < n; i++) {
    finalNormals[i * 3 + 1] = -1;
  }
  // top face normals: +Y
  for (let i = 0; i < n; i++) {
    finalNormals[(topBase + i) * 3 + 1] = 1;
  }
  // side normals already computed above
  for (let i = 0; i < normals.length; i++) {
    finalNormals[sideBase * 3 + i] = normals[i];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(finalNormals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(totalVerts * 2), 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
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
      new THREE.BufferAttribute(new Float32Array([last.x, last.y, last.z, end.x, end.y, end.z]), 3),
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
        points[i].x,
        points[i].y,
        points[i].z,
        points[i + 1].x,
        points[i + 1].y,
        points[i + 1].z,
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
          <meshBasicMaterial color={i === 0 ? CLOSE_SNAP_COLOR : POINT_COLOR} depthTest={false} />
        </mesh>
      ))}
    </>
  );
}

// ─── Extruded preview mesh ─────────────────────────────────────────────────────

function ExtrudePreview({ points, height }: { points: THREE.Vector3[]; height: number }) {
  const geo = useMemo(() => {
    if (points.length < 3 || Math.abs(height) < 0.001) return null;
    return buildExtrudedGeometry(points, height);
  }, [points, height]);

  if (!geo) return null;
  return (
    <>
      <mesh geometry={geo}>
        <meshBasicMaterial
          color={EXTRUDE_PREVIEW_COLOR}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>
      <mesh geometry={geo}>
        <meshBasicMaterial color={EXTRUDE_WIRE_COLOR} wireframe depthTest={false} />
      </mesh>
    </>
  );
}

// Because R3F doesn't give us createPortal for DOM easily without react-dom,
// we use a standalone component approach with direct DOM manipulation.
function HeightLabelDom({
  height,
  screenX,
  screenY,
}: {
  height: number;
  screenX: number;
  screenY: number;
}) {
  const { gl } = useThree();
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const div = document.createElement("div");
    Object.assign(div.style, {
      position: "fixed",
      zIndex: "9999",
      pointerEvents: "none",
      background: "rgba(0,0,0,0.65)",
      color: "#88bbff",
      fontFamily: "monospace",
      fontSize: "12px",
      padding: "2px 6px",
      borderRadius: "3px",
      whiteSpace: "nowrap",
      userSelect: "none",
    });
    document.body.appendChild(div);
    elRef.current = div;
    return () => {
      document.body.removeChild(div);
    };
  }, []);

  useEffect(() => {
    if (!elRef.current) return;
    const rect = gl.domElement.getBoundingClientRect();
    elRef.current.style.left = `${rect.left + screenX + 14}px`;
    elRef.current.style.top = `${rect.top + screenY - 8}px`;
    elRef.current.textContent = `H: ${height.toFixed(2)}`;
  });

  return null;
}

// ─── Distance label DOM overlay ───────────────────────────────────────────────

function DistanceLabelDom({
  from,
  to,
  screenX,
  screenY,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  screenX: number;
  screenY: number;
}) {
  const { gl } = useThree();
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const div = document.createElement("div");
    Object.assign(div.style, {
      position: "fixed",
      zIndex: "9999",
      pointerEvents: "none",
      background: "rgba(0,0,0,0.65)",
      color: "#f0a020",
      fontFamily: "monospace",
      fontSize: "12px",
      padding: "2px 6px",
      borderRadius: "3px",
      whiteSpace: "nowrap",
      userSelect: "none",
    });
    document.body.appendChild(div);
    elRef.current = div;
    return () => {
      document.body.removeChild(div);
    };
  }, []);

  useEffect(() => {
    if (!elRef.current) return;
    const rect = gl.domElement.getBoundingClientRect();
    elRef.current.style.left = `${rect.left + screenX + 14}px`;
    elRef.current.style.top = `${rect.top + screenY - 8}px`;
    elRef.current.textContent = `${from.distanceTo(to).toFixed(2)}`;
  });

  return null;
}

// ─── Cursor gizmo DOM overlay ─────────────────────────────────────────────────

type GizmoVariant = "crosshair" | "snap" | "extrude";

function buildGizmoSvg(variant: GizmoVariant): string {
  switch (variant) {
    case "snap":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke="#44ff88" stroke-width="1.5" fill="none"/>
        <circle cx="12" cy="12" r="3" fill="#44ff88"/>
      </svg>`;
    case "extrude":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <line x1="12" y1="2" x2="12" y2="22" stroke="#88aaff" stroke-width="1.5"/>
        <polygon points="12,1 8,7 16,7" fill="#88aaff"/>
        <polygon points="12,23 8,17 16,17" fill="#88aaff"/>
        <circle cx="12" cy="12" r="2.5" fill="#88aaff"/>
      </svg>`;
    case "crosshair":
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <line x1="12" y1="1" x2="12" y2="11" stroke="#f0a020" stroke-width="1.5"/>
        <line x1="12" y1="13" x2="12" y2="23" stroke="#f0a020" stroke-width="1.5"/>
        <line x1="1" y1="12" x2="11" y2="12" stroke="#f0a020" stroke-width="1.5"/>
        <line x1="13" y1="12" x2="23" y2="12" stroke="#f0a020" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="2.5" fill="#f0a020"/>
      </svg>`;
  }
}

/**
 * DOM overlay that follows the mouse and renders an SVG gizmo.
 * Also hides the native cursor on the canvas while mounted.
 */
function CursorGizmoDom({
  screenX,
  screenY,
  variant,
}: {
  screenX: number;
  screenY: number;
  variant: GizmoVariant;
}) {
  const { gl } = useThree();
  const elRef = useRef<HTMLDivElement | null>(null);
  const variantRef = useRef<GizmoVariant>(variant);
  variantRef.current = variant;

  // Mount: create div, hide native cursor
  useEffect(() => {
    const canvas = gl.domElement;
    const prevCursor = canvas.style.cursor;
    canvas.style.cursor = "none";

    const div = document.createElement("div");
    Object.assign(div.style, {
      position: "fixed",
      zIndex: "9998",
      pointerEvents: "none",
      transform: "translate(-50%, -50%)",
      userSelect: "none",
    });
    document.body.appendChild(div);
    elRef.current = div;

    return () => {
      canvas.style.cursor = prevCursor;
      document.body.removeChild(div);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update position and SVG every render
  useEffect(() => {
    if (!elRef.current) return;
    const rect = gl.domElement.getBoundingClientRect();
    elRef.current.style.left = `${rect.left + screenX}px`;
    elRef.current.style.top = `${rect.top + screenY}px`;
    elRef.current.innerHTML = buildGizmoSvg(variant);
  });

  return null;
}

// ─── Brush bounding box gizmo ─────────────────────────────────────────────────

/**
 * SketchUp-style bounding box for brush mode. Renders a wireframe rectangle
 * (phase 1) or full 3D box (phase 2) around the drawn shape, with W/D labels
 * on the floor plane and an H label on the vertical edge in phase 2. Label
 * divs are projected from 3D midpoints every frame so they stay on the edges
 * as the camera orbits.
 */
function BrushBoundingBoxGizmo({
  points,
  height,
}: {
  points: THREE.Vector3[];
  height?: number;
}) {
  const { camera, size, gl } = useThree();

  // 12 edges × 2 vertices = 24 points = 72 floats (flat rect reuses the box)
  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(72), 3));
    return geo;
  }, []);
  useEffect(() => () => lineGeo.dispose(), [lineGeo]);

  // Three DOM labels (W, D, H) — H hidden in phase 1.
  const labelsRef = useRef<HTMLDivElement[]>([]);
  useEffect(() => {
    const COLORS = ["#ff8888", "#88aaff", "#88ee99"]; // W, D, H
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
    const attr = lineGeo.getAttribute("position") as THREE.BufferAttribute;

    if (points.length < 2) {
      attr.array.fill(0);
      attr.needsUpdate = true;
      labelsRef.current.forEach((d) => (d.style.display = "none"));
      return;
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    const hasH = height !== undefined;
    const h = hasH ? height! : 0;
    const yBot = Math.min(0, h);
    const yTop = Math.max(0, h);
    const cx = (minX + maxX) / 2;
    const cy = (yBot + yTop) / 2;
    const cz = (minZ + maxZ) / 2;

    // 8 corners — for phase 1, yBot === yTop === 0, box degenerates to a rect.
    const C: [number, number, number][] = [
      [minX, yBot, minZ], // 0
      [maxX, yBot, minZ], // 1
      [maxX, yTop, minZ], // 2
      [minX, yTop, minZ], // 3
      [minX, yBot, maxZ], // 4
      [maxX, yBot, maxZ], // 5
      [maxX, yTop, maxZ], // 6
      [minX, yTop, maxZ], // 7
    ];
    const E = [0,1, 1,2, 2,3, 3,0, 4,5, 5,6, 6,7, 7,4, 0,4, 1,5, 2,6, 3,7];
    const pts = new Float32Array(72);
    for (let i = 0; i < E.length; i += 2) {
      pts.set(C[E[i]], (i / 2) * 6);
      pts.set(C[E[i + 1]], (i / 2) * 6 + 3);
    }
    attr.set(pts);
    attr.needsUpdate = true;

    const rect = gl.domElement.getBoundingClientRect();
    const vw = size.width, vh = size.height;

    // Midpoints of edges from corner 0 (front-bottom-left)
    const labelData: { pos: THREE.Vector3; text: string; idx: number }[] = [
      { pos: new THREE.Vector3(cx,    yBot, minZ), text: `W ${(maxX - minX).toFixed(2)}`, idx: 0 },
      { pos: new THREE.Vector3(minX,  yBot, cz  ), text: `D ${(maxZ - minZ).toFixed(2)}`, idx: 1 },
    ];
    if (hasH) {
      labelData.push({ pos: new THREE.Vector3(minX, cy, minZ), text: `H ${Math.abs(h).toFixed(2)}`, idx: 2 });
    }

    // Hide all first, then show the ones in use
    labelsRef.current.forEach((d) => (d.style.display = "none"));
    for (const { pos, text, idx } of labelData) {
      const div = labelsRef.current[idx];
      if (!div) continue;
      const ndc = pos.clone().project(camera);
      if (ndc.z > 1) continue;
      div.style.display = "";
      div.style.left = `${rect.left + (ndc.x * 0.5 + 0.5) * vw}px`;
      div.style.top  = `${rect.top  + (1 - (ndc.y * 0.5 + 0.5)) * vh}px`;
      div.textContent = text;
    }
  });

  return (
    <lineSegments geometry={lineGeo}>
      <lineBasicMaterial color="#f0a020" transparent opacity={0.55} depthTest={false} />
    </lineSegments>
  );
}

// ─── Main brush overlay ───────────────────────────────────────────────────────
export function BrushOverlay(): React.JSX.Element | null {
  const brushType = useModelingStore((s) => s.brushType);
  const { camera, gl } = useThree();

  // ── Shared polygon-draw state ──────────────────────────────────────────────
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  const [cursor, setCursor] = useState<THREE.Vector3 | null>(null);
  const [closingSnap, setClosingSnap] = useState(false);

  // ── Poly3D phase 2 state ───────────────────────────────────────────────────
  /** null = phase 1 (drawing). non-null = phase 2 (extruding). */
  const [extrudePoints, setExtrudePoints] = useState<THREE.Vector3[] | null>(null);
  const [extrudeHeight, setExtrudeHeight] = useState(0);
  /** Screen Y position when phase 2 started, for relative height calculation. */
  const extrudeStartYRef = useRef(0);
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const cursorScreenRef = useRef<THREE.Vector2>(new THREE.Vector2());

  const isPoly3D = brushType === "poly3d";
  const isPolygon = brushType === "polygon";
  const isActive = isPolygon || isPoly3D;

  // ── Reset on brush type change ─────────────────────────────────────────────
  useEffect(() => {
    setPoints([]);
    setCursor(null);
    setClosingSnap(false);
    setExtrudePoints(null);
    setExtrudeHeight(0);
    modelingActions.setBrushPhase(1);
    modelingActions.setBrushPointCount(0);
  }, [brushType]);

  // ── Sync brushPhase and brushPointCount to store ───────────────────────────
  useEffect(() => {
    const phase: 1 | 2 = extrudePoints !== null ? 2 : 1;
    modelingActions.setBrushPhase(phase);
  }, [extrudePoints]);

  useEffect(() => {
    modelingActions.setBrushPointCount(points.length);
  }, [points.length]);

  // ── Commit flat polygon (polygon brush) ───────────────────────────────────
  const commitPolygon = useCallback((pts: THREE.Vector3[]) => {
    if (pts.length < 3) return;
    const { vertices, indices } = triangulatePolygon(pts);
    if (vertices.length === 0) return;

    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(vertices);
    const count = posArr.length / 3;
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    geo.setIndex(indices);

    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);

    const normalArr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      normalArr[i * 3 + 1] = 1;
    }
    geo.setAttribute("normal", new THREE.BufferAttribute(normalArr, 3));
    geo.computeBoundingSphere();

    sceneActions.addMeshWithGeometry(geo, center);
    setPoints([]);
    setCursor(null);
    setClosingSnap(false);
  }, []);

  // ── Enter phase 2 for poly3D ───────────────────────────────────────────────
  const startExtrude = useCallback((pts: THREE.Vector3[], startScreenY: number) => {
    setExtrudePoints(pts);
    setExtrudeHeight(0);
    extrudeStartYRef.current = startScreenY;
    setPoints([]);
    setCursor(null);
    setClosingSnap(false);
  }, []);

  // ── Commit extruded mesh (poly3D phase 2) ─────────────────────────────────
  const commitExtrude = useCallback((pts: THREE.Vector3[], height: number) => {
    if (pts.length < 3 || Math.abs(height) < 0.001) return;
    const geo = buildExtrudedGeometry(pts, height);

    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeBoundingSphere();
    geo.userData.r3eEdited = true;

    sceneActions.addMeshWithGeometry(geo, center);
    setExtrudePoints(null);
    setExtrudeHeight(0);
  }, []);

  // ── Handle pointer events ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas || !isActive) return;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      cursorScreenRef.current.set(sx, sy);
      setCursorScreen({ x: sx, y: sy });

      // Phase 2: compute height from vertical mouse movement
      if (extrudePoints !== null) {
        const dy = extrudeStartYRef.current - sy; // upward = positive
        setExtrudeHeight(dy * HEIGHT_SENSITIVITY * 20);
        return;
      }

      // Phase 1: project to floor
      const ndcX = (sx / rect.width) * 2 - 1;
      const ndcY = -(sy / rect.height) * 2 + 1;
      let hit = projectToFloor(new THREE.Vector2(ndcX, ndcY), camera, raycaster);
      if (hit) {
        const snap = useSettingsStore.getState().snap;
        if (snap.enabled && e.ctrlKey) {
          hit = new THREE.Vector3(
            snapToGrid(hit.x, snap.brushStep),
            hit.y,
            snapToGrid(hit.z, snap.brushStep),
          );
        }
      }
      setCursor(hit);

      if (hit && points.length >= 3) {
        const dist = worldToScreenDist(points[0], cursorScreenRef.current, camera, canvas);
        setClosingSnap(dist < SNAP_RADIUS_PX);
      } else {
        setClosingSnap(false);
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Phase 2 click → confirm extrude
      if (extrudePoints !== null) {
        commitExtrude(extrudePoints, extrudeHeight);
        return;
      }

      // Phase 1 click
      const ndcX = (sx / rect.width) * 2 - 1;
      const ndcY = -(sy / rect.height) * 2 + 1;
      let hit = projectToFloor(new THREE.Vector2(ndcX, ndcY), camera, raycaster);
      if (hit) {
        const snap = useSettingsStore.getState().snap;
        if (snap.enabled && e.ctrlKey) {
          hit = new THREE.Vector3(
            snapToGrid(hit.x, snap.brushStep),
            hit.y,
            snapToGrid(hit.z, snap.brushStep),
          );
        }
      }
      if (!hit) return;

      setPoints((prev) => {
        if (prev.length >= 3) {
          const screenPt = new THREE.Vector2(sx, sy);
          const dist = worldToScreenDist(prev[0], screenPt, camera, canvas);
          if (dist < SNAP_RADIUS_PX) {
            // Close the polygon
            if (isPoly3D) {
              startExtrude(prev, sy);
            } else {
              commitPolygon(prev);
            }
            return [];
          }
        }
        return [...prev, hit];
      });
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [
    points,
    extrudePoints,
    extrudeHeight,
    camera,
    gl,
    raycaster,
    isActive,
    isPoly3D,
    commitPolygon,
    commitExtrude,
    startExtrude,
  ]);

  // ── Keyboard: Enter to commit, Escape to cancel ────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Enter") {
        if (extrudePoints !== null) {
          commitExtrude(extrudePoints, extrudeHeight);
        } else {
          commitPolygon(points);
        }
      } else if (e.key === "Escape") {
        setPoints([]);
        setCursor(null);
        setClosingSnap(false);
        setExtrudePoints(null);
        setExtrudeHeight(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [points, extrudePoints, extrudeHeight, isActive, commitPolygon, commitExtrude]);

  if (!isActive) return null;

  // ── Phase 2 render (extrude preview) ──────────────────────────────────────
  if (extrudePoints !== null) {
    return (
      <>
        <ExtrudePreview points={extrudePoints} height={extrudeHeight} />
        {/* Floor outline of the committed polygon */}
        <CommittedLines points={[...extrudePoints, extrudePoints[0]]} />
        <VertexDots points={extrudePoints} />
        <HeightLabelDom height={extrudeHeight} screenX={cursorScreen.x} screenY={cursorScreen.y} />
        <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="extrude" />
        <BrushBoundingBoxGizmo points={extrudePoints} height={extrudeHeight} />
      </>
    );
  }

  // ── Phase 1 render (polygon drawing) ──────────────────────────────────────
  const gizmoVariant: GizmoVariant = closingSnap ? "snap" : "crosshair";
  return (
    <>
      <CommittedLines points={points} />
      <VertexDots points={points} />
      <PreviewLine points={points} cursor={cursor} closingSnap={closingSnap} />
      <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant={gizmoVariant} />
      {points.length >= 1 && cursor && (
        <DistanceLabelDom
          from={points[points.length - 1]}
          to={cursor}
          screenX={cursorScreen.x}
          screenY={cursorScreen.y}
        />
      )}
      {points.length >= 2 && <BrushBoundingBoxGizmo points={points} />}
    </>
  );
}
