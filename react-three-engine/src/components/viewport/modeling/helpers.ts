import * as THREE from "three/webgpu";
import type { SelectedElement } from "../../../store/modelingStore";

/** Extract vertex at buffer-index i into a Vector3. */
function posAt(positions: Float32Array, i: number): THREE.Vector3 {
  return new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
}

/** Compute the face normal from three vertex buffer-indices. */
function triNormal(positions: Float32Array, i0: number, i1: number, i2: number): THREE.Vector3 {
  return new THREE.Vector3()
    .crossVectors(
      new THREE.Vector3().subVectors(posAt(positions, i1), posAt(positions, i0)),
      new THREE.Vector3().subVectors(posAt(positions, i2), posAt(positions, i0)),
    )
    .normalize();
}

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
  const pa = posAt(positions, a);
  const pb = posAt(positions, b);
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

  const pa = posAt(positions, a);
  const pb = posAt(positions, b);
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
    const oppPos = posAt(positions, opp);
    const faceNormal = triNormal(positions, v[0], v[1], v[2]);
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
      side = findSide(triNormal(positions, v[0], v[1], v[2]));
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
 * Bevel (inset) a face triangle by the given amount.
 *
 * Each vertex of the triangle is moved toward the face centroid by `amount`
 * (clamped so it never overshoots the centroid).  The original triangle is
 * replaced by:
 *   - an inset inner triangle (a', b', c')
 *   - three side quads connecting the original perimeter to the inset edges
 */
export function bevelFace(
  geo: THREE.BufferGeometry,
  faceIdx: number,
  amount: number,
): void {
  const positions = getPositions(geo);
  const indices = getIndices(geo);
  if (!indices) return;

  const a = indices[faceIdx * 3];
  const b = indices[faceIdx * 3 + 1];
  const c = indices[faceIdx * 3 + 2];

  const pa = posAt(positions, a);
  const pb = posAt(positions, b);
  const pc = posAt(positions, c);
  const centroid = new THREE.Vector3().addVectors(pa, pb).add(pc).multiplyScalar(1 / 3);

  // Move each vertex toward the centroid by `amount`, clamped to 99% of the distance
  const insetVertex = (p: THREE.Vector3): THREE.Vector3 => {
    const toCenter = new THREE.Vector3().subVectors(centroid, p);
    const dist = toCenter.length();
    if (dist < 1e-6) return p.clone();
    const t = Math.min(amount / dist, 0.99);
    return p.clone().addScaledVector(toCenter, t);
  };

  const pa2 = insetVertex(pa);
  const pb2 = insetVertex(pb);
  const pc2 = insetVertex(pc);

  // Append 3 new inset vertices (a', b', c')
  const ai = positions.length / 3;
  const bi = ai + 1;
  const ci = ai + 2;
  const newPositions = new Float32Array(positions.length + 9);
  newPositions.set(positions);
  newPositions[positions.length + 0] = pa2.x;
  newPositions[positions.length + 1] = pa2.y;
  newPositions[positions.length + 2] = pa2.z;
  newPositions[positions.length + 3] = pb2.x;
  newPositions[positions.length + 4] = pb2.y;
  newPositions[positions.length + 5] = pb2.z;
  newPositions[positions.length + 6] = pc2.x;
  newPositions[positions.length + 7] = pc2.y;
  newPositions[positions.length + 8] = pc2.z;

  // Rebuild index buffer: replace the target face with inset + side quads
  const newIndices: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    if (i !== faceIdx * 3) {
      newIndices.push(indices[i], indices[i + 1], indices[i + 2]);
      continue;
    }
    // Inset triangle (preserves original CCW winding)
    newIndices.push(ai, bi, ci);
    // Side quads: for each edge x→y of the original face, pattern is (x, y, yi, x, yi, xi)
    // This winding gives the same outward normal as the original face (verified analytically)
    newIndices.push(a, b, bi, a, bi, ai);
    newIndices.push(b, c, ci, b, ci, bi);
    newIndices.push(c, a, ai, c, ai, ci);
  }

  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
  flushPositions(geo, newPositions);
}

/**
 * Find the "quad partner" triangle for a given face index.
 *
 * A quad in a triangulated mesh is two coplanar triangles that share a
 * geometric edge (same XYZ positions, not necessarily the same buffer index —
 * handles split-vertex geometries like BoxGeometry).
 *
 * Returns the face index of the partner triangle, or null if none is found.
 */
export function findQuadPartner(
  geo: THREE.BufferGeometry,
  faceIdx: number,
  coplanarDotThreshold = 0.999,
): number | null {
  const positions = getPositions(geo);
  const indices = getIndices(geo);
  const faceCount = indices
    ? Math.floor(indices.length / 3)
    : Math.floor(positions.length / 9);

  const getTriVerts = (fi: number): [THREE.Vector3, THREE.Vector3, THREE.Vector3] => {
    if (indices) {
      const a = indices[fi * 3], b = indices[fi * 3 + 1], c = indices[fi * 3 + 2];
      return [posAt(positions, a), posAt(positions, b), posAt(positions, c)];
    }
    const base = fi * 9;
    return [
      new THREE.Vector3(positions[base], positions[base + 1], positions[base + 2]),
      new THREE.Vector3(positions[base + 3], positions[base + 4], positions[base + 5]),
      new THREE.Vector3(positions[base + 6], positions[base + 7], positions[base + 8]),
    ];
  };

  const getFaceNormal = (verts: [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.Vector3 =>
    new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(verts[1], verts[0]),
        new THREE.Vector3().subVectors(verts[2], verts[0]),
      )
      .normalize();

  const eps2 = 1e-8;
  const samePos = (a: THREE.Vector3, b: THREE.Vector3): boolean => a.distanceToSquared(b) < eps2;

  const targetVerts = getTriVerts(faceIdx);
  const targetNormal = getFaceNormal(targetVerts);

  for (let fi = 0; fi < faceCount; fi++) {
    if (fi === faceIdx) continue;

    const candidateVerts = getTriVerts(fi);
    const candidateNormal = getFaceNormal(candidateVerts);

    if (Math.abs(targetNormal.dot(candidateNormal)) < coplanarDotThreshold) continue;

    let sharedCount = 0;
    for (const tv of targetVerts) {
      for (const cv of candidateVerts) {
        if (samePos(tv, cv)) { sharedCount++; break; }
      }
    }

    if (sharedCount === 2) return fi;
  }

  return null;
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

/**
 * Extrude a single triangle face along its normal by the given amount.
 *
 * The original face is replaced by a top face (the extruded triangle) and
 * three side quads that connect the base perimeter to the extruded face.
 */
export function extrudeFace(
  geo: THREE.BufferGeometry,
  faceIdx: number,
  amount: number,
): void {
  const positions = getPositions(geo);
  const indices = getIndices(geo);
  if (!indices) return;
  if (faceIdx * 3 + 2 >= indices.length) return;

  const a = indices[faceIdx * 3];
  const b = indices[faceIdx * 3 + 1];
  const c = indices[faceIdx * 3 + 2];

  const pa = posAt(positions, a);
  const pb = posAt(positions, b);
  const pc = posAt(positions, c);
  const normal = triNormal(positions, a, b, c);

  const pa2 = pa.clone().addScaledVector(normal, amount);
  const pb2 = pb.clone().addScaledVector(normal, amount);
  const pc2 = pc.clone().addScaledVector(normal, amount);

  const ai = positions.length / 3;
  const bi = ai + 1;
  const ci = ai + 2;

  const newPositions = new Float32Array(positions.length + 9);
  newPositions.set(positions);
  newPositions[positions.length + 0] = pa2.x;
  newPositions[positions.length + 1] = pa2.y;
  newPositions[positions.length + 2] = pa2.z;
  newPositions[positions.length + 3] = pb2.x;
  newPositions[positions.length + 4] = pb2.y;
  newPositions[positions.length + 5] = pb2.z;
  newPositions[positions.length + 6] = pc2.x;
  newPositions[positions.length + 7] = pc2.y;
  newPositions[positions.length + 8] = pc2.z;

  const newIndices: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    if (i !== faceIdx * 3) {
      newIndices.push(indices[i], indices[i + 1], indices[i + 2]);
      continue;
    }
    // Top face (same CCW winding = same outward normal)
    newIndices.push(ai, bi, ci);
    // Side quads: for each edge x→y, pattern (x, y, yi) + (xi, x, yi)
    newIndices.push(a, b, bi, ai, a, bi);
    newIndices.push(b, c, ci, bi, b, ci);
    newIndices.push(c, a, ai, ci, c, ai);
  }

  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
  flushPositions(geo, newPositions);
}

/**
 * Extrude a quad face (two coplanar triangles) along its normal by the given amount.
 *
 * The original two triangles are replaced by a top quad face and four side quads.
 */
export function extrudeQuadFace(
  geo: THREE.BufferGeometry,
  faceIdxA: number,
  faceIdxB: number,
  amount: number,
): void {
  const positions = getPositions(geo);
  const indices = getIndices(geo);
  if (!indices) return;

  const ia = [indices[faceIdxA * 3], indices[faceIdxA * 3 + 1], indices[faceIdxA * 3 + 2]];
  const ib = [indices[faceIdxB * 3], indices[faceIdxB * 3 + 1], indices[faceIdxB * 3 + 2]];

  const pos = (vi: number) => posAt(positions, vi);

  const eps2 = 1e-8;
  const samePos = (a: number, b: number) => pos(a).distanceToSquared(pos(b)) < eps2;

  const sharedA: number[] = [];
  const sharedB: number[] = [];
  for (const va of ia) {
    for (const vb of ib) {
      if (samePos(va, vb)) { sharedA.push(va); sharedB.push(vb); break; }
    }
  }

  if (sharedA.length !== 2) {
    // Process higher index first so the first mutation doesn't shift the lower index
    const [hi, lo] = faceIdxA > faceIdxB ? [faceIdxA, faceIdxB] : [faceIdxB, faceIdxA];
    extrudeFace(geo, hi, amount);
    extrudeFace(geo, lo, amount);
    return;
  }

  const uniqueA = ia.filter((v) => !sharedA.includes(v));
  const uniqueB = ib.filter((v) => !sharedB.includes(v));
  if (uniqueA.length !== 1 || uniqueB.length !== 1) {
    const [hi, lo] = faceIdxA > faceIdxB ? [faceIdxA, faceIdxB] : [faceIdxB, faceIdxA];
    extrudeFace(geo, hi, amount);
    extrudeFace(geo, lo, amount);
    return;
  }

  const uA = uniqueA[0];
  const uB = uniqueB[0];
  const [s0, s1] = sharedA;

  const puA = pos(uA), ps0 = pos(s0), ps1 = pos(s1);
  const faceNormalA = triNormal(positions, ia[0], ia[1], ia[2]);

  // Order the 4 ring vertices CCW when viewed from faceNormalA
  let ring: [number, number, number, number];
  const crossTest = new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(ps0, puA),
    new THREE.Vector3().subVectors(pos(uB), puA),
  );
  if (crossTest.dot(faceNormalA) >= 0) {
    ring = [uA, s0, uB, s1];
  } else {
    ring = [uA, s1, uB, s0];
  }

  const n = 4;
  const ringPos = ring.map(pos);

  // Extrude each ring vertex along the face normal
  const extrudedPos: THREE.Vector3[] = ringPos.map((p) =>
    p.clone().addScaledVector(faceNormalA, amount),
  );

  const base = positions.length / 3;
  const extIdx = ring.map((_, i) => base + i);

  const newPositions = new Float32Array(positions.length + n * 3);
  newPositions.set(positions);
  for (let i = 0; i < n; i++) {
    newPositions[positions.length + i * 3 + 0] = extrudedPos[i].x;
    newPositions[positions.length + i * 3 + 1] = extrudedPos[i].y;
    newPositions[positions.length + i * 3 + 2] = extrudedPos[i].z;
  }

  const faceSetA = faceIdxA * 3;
  const faceSetB = faceIdxB * 3;

  const newIndices: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    if (i === faceSetA || i === faceSetB) continue;
    newIndices.push(indices[i], indices[i + 1], indices[i + 2]);
  }

  // Top face (two triangles, same CCW winding as original)
  const [ii0, ii1, ii2, ii3] = extIdx;
  newIndices.push(ii0, ii1, ii2);
  newIndices.push(ii0, ii2, ii3);

  // Side quads: for each ring edge o_i→o_{i+1}, pattern (oi, oj, ej) + (ei, oi, ej)
  for (let i = 0; i < n; i++) {
    const oi = ring[i];
    const oj = ring[(i + 1) % n];
    const ei = extIdx[i];
    const ej = extIdx[(i + 1) % n];
    newIndices.push(oi, oj, ej, ei, oi, ej);
  }

  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
  flushPositions(geo, newPositions);
}

export type FacePolygon =
  | { kind: "tri"; faceIdx: number }
  | { kind: "quad"; faceIdxA: number; faceIdxB: number };

export function groupFacesIntoPolygons(
  faceIndices: number[],
  geo: THREE.BufferGeometry,
): FacePolygon[] {
  const remaining = new Set(faceIndices);
  const result: FacePolygon[] = [];

  for (const fi of faceIndices) {
    if (!remaining.has(fi)) continue;
    remaining.delete(fi);

    const partner = findQuadPartner(geo, fi);
    if (partner !== null && remaining.has(partner)) {
      remaining.delete(partner);
      result.push({ kind: "quad", faceIdxA: fi, faceIdxB: partner });
    } else {
      result.push({ kind: "tri", faceIdx: fi });
    }
  }

  return result;
}

export function bevelQuadFace(
  geo: THREE.BufferGeometry,
  faceIdxA: number,
  faceIdxB: number,
  amount: number,
): void {
  const positions = getPositions(geo);
  const indices = getIndices(geo);
  if (!indices) return;

  const ia = [indices[faceIdxA * 3], indices[faceIdxA * 3 + 1], indices[faceIdxA * 3 + 2]];
  const ib = [indices[faceIdxB * 3], indices[faceIdxB * 3 + 1], indices[faceIdxB * 3 + 2]];

  const pos = (vi: number) => posAt(positions, vi);

  const eps2 = 1e-8;
  const samePos = (a: number, b: number) => pos(a).distanceToSquared(pos(b)) < eps2;

  const sharedA: number[] = [];
  const sharedB: number[] = [];
  for (const va of ia) {
    for (const vb of ib) {
      if (samePos(va, vb)) { sharedA.push(va); sharedB.push(vb); break; }
    }
  }

  if (sharedA.length !== 2) {
    bevelFace(geo, faceIdxA, amount);
    bevelFace(geo, faceIdxB, amount);
    return;
  }

  const uniqueA = ia.filter((v) => !sharedA.includes(v));
  const uniqueB = ib.filter((v) => !sharedB.includes(v));
  if (uniqueA.length !== 1 || uniqueB.length !== 1) {
    bevelFace(geo, faceIdxA, amount);
    bevelFace(geo, faceIdxB, amount);
    return;
  }

  const uA = uniqueA[0];
  const uB = uniqueB[0];
  const [s0, s1] = sharedA;

  const puA = pos(uA), puB = pos(uB), ps0 = pos(s0), ps1 = pos(s1);
  const faceNormalA = triNormal(positions, ia[0], ia[1], ia[2]);

  // Order the 4 perimeter vertices CCW (matching faceNormalA winding).
  // Start from uA, walk: uA → s0 → uB → s1 (or uA → s1 → uB → s0).
  // Pick the ordering whose first cross product matches faceNormalA.
  let ring: [number, number, number, number];
  const crossTest = new THREE.Vector3()
    .crossVectors(
      new THREE.Vector3().subVectors(ps0, puA),
      new THREE.Vector3().subVectors(puB, puA),
    );
  if (crossTest.dot(faceNormalA) >= 0) {
    ring = [uA, s0, uB, s1];
  } else {
    ring = [uA, s1, uB, s0];
  }

  const ringPos = ring.map(pos);
  const n = 4;

  // Uniform inset via corner bisector: inward bisector = normalize(inPrev + inNext),
  // scaled by amount / sin(θ/2) so perpendicular distance to both adjacent edges = amount.
  const faceNormal = faceNormalA;
  const insetPositions: THREE.Vector3[] = ringPos.map((p, i) => {
    const prev = ringPos[(i + n - 1) % n];
    const next = ringPos[(i + 1) % n];

    const edgePrev = new THREE.Vector3().subVectors(p, prev).normalize();
    const edgeNext = new THREE.Vector3().subVectors(next, p).normalize();

    const inPrev = new THREE.Vector3().crossVectors(faceNormal, edgePrev).normalize();
    const inNext = new THREE.Vector3().crossVectors(faceNormal, edgeNext).normalize();

    const bisector = new THREE.Vector3().addVectors(inPrev, inNext);
    const bisectorLen = bisector.length();
    if (bisectorLen < 1e-6) return p.clone().addScaledVector(inPrev, amount);

    bisector.divideScalar(bisectorLen);

    const sinHalf = new THREE.Vector3().crossVectors(bisector, edgeNext).length();
    const scale = sinHalf < 1e-6 ? amount : Math.min(amount / sinHalf, 0.49);

    return p.clone().addScaledVector(bisector, scale);
  });

  const base = positions.length / 3;
  const insetIdx = ring.map((_, i) => base + i);

  const newPositions = new Float32Array(positions.length + n * 3);
  newPositions.set(positions);
  for (let i = 0; i < n; i++) {
    newPositions[positions.length + i * 3 + 0] = insetPositions[i].x;
    newPositions[positions.length + i * 3 + 1] = insetPositions[i].y;
    newPositions[positions.length + i * 3 + 2] = insetPositions[i].z;
  }

  const faceSetA = faceIdxA * 3;
  const faceSetB = faceIdxB * 3;

  const newIndices: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    if (i === faceSetA || i === faceSetB) continue;
    newIndices.push(indices[i], indices[i + 1], indices[i + 2]);
  }

  const [ii0, ii1, ii2, ii3] = insetIdx;
  newIndices.push(ii0, ii1, ii2);
  newIndices.push(ii0, ii2, ii3);

  for (let i = 0; i < n; i++) {
    const o0 = ring[i];
    const o1 = ring[(i + 1) % n];
    const i0 = insetIdx[i];
    const i1 = insetIdx[(i + 1) % n];
    newIndices.push(o0, o1, i1);
    newIndices.push(o0, i1, i0);
  }

  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
  flushPositions(geo, newPositions);
}
