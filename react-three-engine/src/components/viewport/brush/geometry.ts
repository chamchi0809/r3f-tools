import * as THREE from "three/webgpu";
import { FLOOR_Y } from "./constants";

/** Triangulate a flat polygon on XZ plane using earcut (supports concave shapes). */
export function triangulatePolygon(pts: THREE.Vector3[]): {
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
export function buildExtrudedGeometry(pts: THREE.Vector3[], height: number): THREE.BufferGeometry {
  // Normalize pts to CCW in XZ so top/bottom/side winding assumptions hold.
  // User click points can arrive in CW order → signed area < 0 → flip.
  let signedArea = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    signedArea += a.x * b.z - b.x * a.z;
  }
  if (signedArea < 0) pts = [...pts].reverse();
  const n = pts.length;
  const h = Math.abs(height);
  const yTop = FLOOR_Y + (height >= 0 ? h : 0);
  const yBot = FLOOR_Y + (height >= 0 ? 0 : -h);

  const pos: number[] = [];
  const idx: number[] = [];

  // Helper: add a triangle (vertices already in desired winding order)
  function tri(ax: number, ay: number, az: number,
               bx: number, by: number, bz: number,
               cx: number, cy: number, cz: number) {
    const base = pos.length / 3;
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    idx.push(base, base + 1, base + 2);
  }

  // ── Top face (normal = +Y) ─────────────────────────────────────────────────
  const topPts = pts.map((p) => new THREE.Vector3(p.x, yTop, p.z));
  const { indices: topRaw } = triangulatePolygon(topPts);
  for (let i = 0; i < topRaw.length; i += 3) {
    const a = topPts[topRaw[i]], b = topPts[topRaw[i + 1]], c = topPts[topRaw[i + 2]];
    tri(a.x, a.y, a.z,  c.x, c.y, c.z,  b.x, b.y, b.z); // reversed
  }

  // ── Bottom face (normal = -Y) ───────────────────────────────────────────────
  const botPts = pts.map((p) => new THREE.Vector3(p.x, yBot, p.z));
  const { indices: botRaw } = triangulatePolygon(botPts);
  for (let i = 0; i < botRaw.length; i += 3) {
    const a = botPts[botRaw[i]], b = botPts[botRaw[i + 1]], c = botPts[botRaw[i + 2]];
    tri(a.x, a.y, a.z,  b.x, b.y, b.z,  c.x, c.y, c.z); // as-is
  }

  // ── Side walls ──────────────────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const bi = botPts[i], bj = botPts[j];
    const ti = topPts[i], tj = topPts[j];
    tri(bi.x, bi.y, bi.z,  ti.x, ti.y, ti.z,  tj.x, tj.y, tj.z);
    tri(bi.x, bi.y, bi.z,  tj.x, tj.y, tj.z,  bj.x, bj.y, bj.z);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Build 4 CCW rectangle corners on the floor plane from two diagonal corners. */
export function rectPointsFromCorners(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minZ = Math.min(a.z, b.z);
  const maxZ = Math.max(a.z, b.z);
  return [
    new THREE.Vector3(minX, FLOOR_Y, minZ),
    new THREE.Vector3(maxX, FLOOR_Y, minZ),
    new THREE.Vector3(maxX, FLOOR_Y, maxZ),
    new THREE.Vector3(minX, FLOOR_Y, maxZ),
  ];
}

/** Project NDC → floor plane (Y = FLOOR_Y) using raycasting. */
export function projectToFloor(
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
export function worldToScreenDist(
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
