import * as THREE from "three/webgpu";
import type { SelectedElement } from "../../../store/modelingStore";

export function getPositions(geo: THREE.BufferGeometry): Float32Array {
  const attr = geo.getAttribute("position");
  if (!attr) return new Float32Array(0);
  return attr.array as Float32Array;
}

export function getIndices(geo: THREE.BufferGeometry): number[] | null {
  const idx = geo.getIndex();
  if (!idx) return null;
  return Array.from(idx.array as Uint32Array);
}

/** Build a cylinder geometry between two points for edge hit detection */
export function makeCylinderGeometry(
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
export function flushPositions(geo: THREE.BufferGeometry, positions: Float32Array): void {
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
export function selectedVertexIndices(
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
 * Split a triangle at a given edge, inserting a new vertex p at index pIdx.
 * Preserves winding order. Returns two replacement triangles.
 */
export function splitTriangleAtEdge(
  tri: [number, number, number],
  a: number,
  b: number,
  pIdx: number,
): [[number, number, number], [number, number, number]] {
  const [v0, v1, v2] = tri;
  if ((v0 === a && v1 === b) || (v0 === b && v1 === a)) {
    const [from, to] = v0 === a ? [a, b] : [b, a];
    return [[from, pIdx, v2], [pIdx, to, v2]];
  } else if ((v1 === a && v2 === b) || (v1 === b && v2 === a)) {
    const [from, to] = v1 === a ? [a, b] : [b, a];
    return [[v0, from, pIdx], [v0, pIdx, to]];
  } else {
    // edge is v2–v0 in winding order
    const [from, to] = v2 === a ? [a, b] : [b, a];
    return [[to, v1, pIdx], [pIdx, v1, from]];
  }
}

/**
 * Insert a new vertex on edge (a, b) by projecting localPoint onto the edge segment.
 * Every triangle sharing that edge is split into two.
 */
export function addVertexOnEdge(
  geo: THREE.BufferGeometry,
  a: number,
  b: number,
  localPoint: THREE.Vector3,
): void {
  const positions = getPositions(geo);
  const indices = getIndices(geo);
  if (!indices) return;

  // Project localPoint onto the edge line segment
  const pa = new THREE.Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]);
  const pb = new THREE.Vector3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
  const edge = new THREE.Vector3().subVectors(pb, pa);
  const t = Math.max(0.01, Math.min(0.99, localPoint.clone().sub(pa).dot(edge) / edge.lengthSq()));
  const p = pa.clone().addScaledVector(edge, t);

  // Append the new vertex
  const pIdx = positions.length / 3;
  const newPositions = new Float32Array(positions.length + 3);
  newPositions.set(positions);
  newPositions[positions.length] = p.x;
  newPositions[positions.length + 1] = p.y;
  newPositions[positions.length + 2] = p.z;

  // Build co-located groups for a and b so split-vertex geometries
  // (e.g. BoxGeometry) where each face has its own copy of the shared
  // edge vertices are handled correctly. Without this, only the one
  // face whose indices literally match a/b gets split; all other faces
  // sharing the same geometric edge are left detached.
  const eps2 = 1e-10;
  const aGroup = new Set<number>([a]);
  const bGroup = new Set<number>([b]);
  for (let i = 0; i < newPositions.length / 3; i++) {
    const ix = newPositions[i * 3], iy = newPositions[i * 3 + 1], iz = newPositions[i * 3 + 2];
    const dax = ix - pa.x, day = iy - pa.y, daz = iz - pa.z;
    if (dax * dax + day * day + daz * daz < eps2) aGroup.add(i);
    const dbx = ix - pb.x, dby = iy - pb.y, dbz = iz - pb.z;
    if (dbx * dbx + dby * dby + dbz * dbz < eps2) bGroup.add(i);
  }

  // Rebuild index buffer, splitting every triangle that contains any
  // co-located pair of (a-group vertex, b-group vertex).
  const newIndices: number[] = [];
  for (let ti = 0; ti < indices.length; ti += 3) {
    const v0 = indices[ti], v1 = indices[ti + 1], v2 = indices[ti + 2];
    // Find which vertex in this triangle belongs to aGroup and which to bGroup
    const vA = aGroup.has(v0) ? v0 : aGroup.has(v1) ? v1 : aGroup.has(v2) ? v2 : -1;
    const vB = bGroup.has(v0) ? v0 : bGroup.has(v1) ? v1 : bGroup.has(v2) ? v2 : -1;
    if (vA !== -1 && vB !== -1 && vA !== vB) {
      const [t1, t2] = splitTriangleAtEdge([v0, v1, v2], vA, vB, pIdx);
      newIndices.push(...t1, ...t2);
    } else {
      newIndices.push(v0, v1, v2);
    }
  }

  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
  flushPositions(geo, newPositions);
}

/**
 * Insert a new vertex on a face by splitting the triangle into three (triangle fan).
 */
export function addVertexOnFace(
  geo: THREE.BufferGeometry,
  faceIdx: number,
  localPoint: THREE.Vector3,
): void {
  const positions = getPositions(geo);
  const indices = getIndices(geo);
  if (!indices) return;

  const a = indices[faceIdx * 3];
  const b = indices[faceIdx * 3 + 1];
  const c = indices[faceIdx * 3 + 2];

  // Append the new vertex
  const pIdx = positions.length / 3;
  const newPositions = new Float32Array(positions.length + 3);
  newPositions.set(positions);
  newPositions[positions.length] = localPoint.x;
  newPositions[positions.length + 1] = localPoint.y;
  newPositions[positions.length + 2] = localPoint.z;

  // Replace the target face with a triangle fan (a,b,p), (b,c,p), (c,a,p)
  const newIndices: number[] = [];
  for (let ti = 0; ti < indices.length; ti += 3) {
    if (ti === faceIdx * 3) {
      newIndices.push(a, b, pIdx, b, c, pIdx, c, a, pIdx);
    } else {
      newIndices.push(indices[ti], indices[ti + 1], indices[ti + 2]);
    }
  }

  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
  flushPositions(geo, newPositions);
}

/**
 * Expand a set of vertex indices to include ALL position-buffer entries that
 * are co-located (within epsilon) with any vertex already in the set.
 *
 * This is required for geometries like BoxGeometry that store split vertices
 * (duplicate XYZ entries per face for per-face normals). Without this,
 * moving a face only shifts one copy of each corner, tearing adjacent faces.
 */
export function expandToColocated(baseSet: Set<number>, positions: Float32Array, eps = 1e-5): Set<number> {
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
