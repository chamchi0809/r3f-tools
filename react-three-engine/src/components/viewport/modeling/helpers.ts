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
