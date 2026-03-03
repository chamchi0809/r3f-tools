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
 * Bevel an edge (a, b) by the given amount.
 *
 * Handles split-vertex geometries (e.g. BoxGeometry) by expanding edge
 * endpoints to all co-located vertex copies, grouping adjacent triangles by
 * face normal into two sides, and propagating the new vertex references to
 * every triangle on each face.  A bevel strip quad and endpoint caps are then
 * inserted to keep the mesh watertight.
 */
export function bevelEdge(
  geo: THREE.BufferGeometry,
  a: number,
  b: number,
  amount: number,
): void {
  const positions = getPositions(geo);
  const indices = getIndices(geo);
  if (!indices) return;

  const pa = new THREE.Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]);
  const pb = new THREE.Vector3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
  const abHat = new THREE.Vector3().subVectors(pb, pa).normalize();

  // Expand to co-located vertex groups (handles split-vertex / per-face-normal geometries)
  const aGroup = expandToColocated(new Set([a]), positions);
  const bGroup = expandToColocated(new Set([b]), positions);

  // Find all triangles that straddle this geometric edge (one vertex from each group)
  type AdjTri = {
    startIdx: number;
    v: [number, number, number];
    vA: number;
    vB: number;
    opp: number;
    oppPos: THREE.Vector3;
    faceNormal: THREE.Vector3;
  };
  const adjTris: AdjTri[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const v = [indices[i], indices[i + 1], indices[i + 2]] as [number, number, number];
    const vA = v.find((x) => aGroup.has(x));
    const vB = v.find((x) => bGroup.has(x));
    if (vA === undefined || vB === undefined || vA === vB) continue;
    const opp = v.find((x) => x !== vA && x !== vB)!;
    const oppPos = new THREE.Vector3(positions[opp * 3], positions[opp * 3 + 1], positions[opp * 3 + 2]);
    const p0 = new THREE.Vector3(positions[v[0] * 3], positions[v[0] * 3 + 1], positions[v[0] * 3 + 2]);
    const p1 = new THREE.Vector3(positions[v[1] * 3], positions[v[1] * 3 + 1], positions[v[1] * 3 + 2]);
    const p2 = new THREE.Vector3(positions[v[2] * 3], positions[v[2] * 3 + 1], positions[v[2] * 3 + 2]);
    const faceNormal = new THREE.Vector3()
      .crossVectors(new THREE.Vector3().subVectors(p1, p0), new THREE.Vector3().subVectors(p2, p0))
      .normalize();
    adjTris.push({ startIdx: i, v, vA, vB, opp, oppPos, faceNormal });
  }
  if (adjTris.length === 0) return;

  // Group adjacent triangles into sides by face-normal similarity
  // (each side = one face of the mesh bordering this geometric edge)
  const SAME_FACE_DOT = 0.99;
  type Side = {
    tris: AdjTri[];
    avgNormal: THREE.Vector3;
    avgOppPos: THREE.Vector3;
    perpDir: THREE.Vector3;
    newA: number;
    newB: number;
  };
  const sides: Side[] = [];
  for (const tri of adjTris) {
    let placed = false;
    for (const side of sides) {
      if (side.avgNormal.dot(tri.faceNormal) > SAME_FACE_DOT) {
        side.tris.push(tri);
        side.avgOppPos.add(tri.oppPos).multiplyScalar(0.5);
        side.avgNormal.add(tri.faceNormal).normalize();
        placed = true;
        break;
      }
    }
    if (!placed) {
      sides.push({
        tris: [tri],
        avgNormal: tri.faceNormal.clone(),
        avgOppPos: tri.oppPos.clone(),
        perpDir: new THREE.Vector3(),
        newA: -1,
        newB: -1,
      });
    }
  }
  if (sides.length === 0) return;

  // Clamp amount so vertices don't overshoot the opposite edge
  let maxAmount = Infinity;
  for (const side of sides) {
    const toOpp = new THREE.Vector3().subVectors(side.avgOppPos, pa);
    const perpLen = toOpp.clone().sub(abHat.clone().multiplyScalar(toOpp.dot(abHat))).length();
    maxAmount = Math.min(maxAmount, perpLen * 0.49);
  }
  const clampedAmount = Math.min(amount, maxAmount);

  // Create one new vertex per side per endpoint
  const newPositionsArr: number[] = Array.from(positions);
  for (const side of sides) {
    const toOpp = new THREE.Vector3().subVectors(side.avgOppPos, pa);
    side.perpDir = toOpp
      .clone()
      .sub(abHat.clone().multiplyScalar(toOpp.dot(abHat)))
      .normalize();
    const newAPos = pa.clone().addScaledVector(side.perpDir, clampedAmount);
    const newBPos = pb.clone().addScaledVector(side.perpDir, clampedAmount);
    side.newA = newPositionsArr.length / 3;
    newPositionsArr.push(newAPos.x, newAPos.y, newAPos.z);
    side.newB = newPositionsArr.length / 3;
    newPositionsArr.push(newBPos.x, newBPos.y, newBPos.z);
  }

  // Map from triangle start index → its side
  const triSideMap = new Map<number, Side>();
  for (const side of sides) {
    for (const tri of side.tris) triSideMap.set(tri.startIdx, side);
  }

  // Helper: find closest side for a triangle by face normal (returns null if none close enough)
  const findSide = (faceNormal: THREE.Vector3): Side | null => {
    let best: Side | null = null;
    let bestDot = SAME_FACE_DOT;
    for (const side of sides) {
      const d = side.avgNormal.dot(faceNormal);
      if (d > bestDot) { bestDot = d; best = side; }
    }
    return best;
  };

  // Rebuild index buffer
  const newIndices: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const v = [indices[i], indices[i + 1], indices[i + 2]];
    const hasA = v.some((x) => aGroup.has(x));
    const hasB = v.some((x) => bGroup.has(x));

    if (!hasA && !hasB) {
      newIndices.push(...v);
      continue;
    }

    // Determine the bevel side for this triangle
    let side: Side | null = triSideMap.get(i) ?? null;

    if (!side) {
      // Not a direct edge triangle — find side by face normal
      const p0 = new THREE.Vector3(positions[v[0] * 3], positions[v[0] * 3 + 1], positions[v[0] * 3 + 2]);
      const p1 = new THREE.Vector3(positions[v[1] * 3], positions[v[1] * 3 + 1], positions[v[1] * 3 + 2]);
      const p2 = new THREE.Vector3(positions[v[2] * 3], positions[v[2] * 3 + 1], positions[v[2] * 3 + 2]);
      const fn = new THREE.Vector3()
        .crossVectors(new THREE.Vector3().subVectors(p1, p0), new THREE.Vector3().subVectors(p2, p0))
        .normalize();
      side = findSide(fn);
    }

    if (!side) {
      // Perpendicular face sharing only a corner: leave untouched
      newIndices.push(...v);
      continue;
    }

    // Replace aGroup → side.newA, bGroup → side.newB
    newIndices.push(...v.map((x) => {
      if (aGroup.has(x)) return side!.newA;
      if (bGroup.has(x)) return side!.newB;
      return x;
    }));
  }

  // Bevel strip + endpoint caps (requires exactly 2 sides for a manifold edge)
  if (sides.length >= 2) {
    const [s0, s1] = sides;
    const a1 = s0.newA, b1 = s0.newB, a2 = s1.newA, b2 = s1.newB;

    const pa1 = new THREE.Vector3(newPositionsArr[a1 * 3], newPositionsArr[a1 * 3 + 1], newPositionsArr[a1 * 3 + 2]);
    const pb1 = new THREE.Vector3(newPositionsArr[b1 * 3], newPositionsArr[b1 * 3 + 1], newPositionsArr[b1 * 3 + 2]);
    const pa2 = new THREE.Vector3(newPositionsArr[a2 * 3], newPositionsArr[a2 * 3 + 1], newPositionsArr[a2 * 3 + 2]);
    const pb2 = new THREE.Vector3(newPositionsArr[b2 * 3], newPositionsArr[b2 * 3 + 1], newPositionsArr[b2 * 3 + 2]);

    // Strip: desired outward normal = negate of average inset perpDirs
    const desiredStripNorm = s0.perpDir.clone().add(s1.perpDir).negate().normalize();
    const stripNorm = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(pb1, pa1),
      new THREE.Vector3().subVectors(pa2, pa1),
    );
    if (stripNorm.dot(desiredStripNorm) >= 0) {
      newIndices.push(a1, b1, b2, a1, b2, a2);
    } else {
      newIndices.push(a1, a2, b2, a1, b2, b1);
    }

    // Cap at a — desired normal along −abHat (away from b)
    const capANorm = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(pa1, pa),
      new THREE.Vector3().subVectors(pa2, pa),
    );
    if (capANorm.dot(abHat.clone().negate()) >= 0) {
      newIndices.push(a, a1, a2);
    } else {
      newIndices.push(a, a2, a1);
    }

    // Cap at b — desired normal along +abHat (away from a)
    const capBNorm = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(pb1, pb),
      new THREE.Vector3().subVectors(pb2, pb),
    );
    if (capBNorm.dot(abHat) >= 0) {
      newIndices.push(b, b1, b2);
    } else {
      newIndices.push(b, b2, b1);
    }

  }

  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
  flushPositions(geo, new Float32Array(newPositionsArr));
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
