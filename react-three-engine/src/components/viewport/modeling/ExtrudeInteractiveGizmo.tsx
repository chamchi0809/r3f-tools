/**
 * ExtrudeInteractiveGizmo — mouse-driven extrude preview for modeling mode.
 *
 * Mirrors how brush phase-2 (extrude) works:
 *   - Moving mouse up/down controls the extrude height in real time.
 *   - A transparent solid + wireframe preview shows the result.
 *   - DOM overlays: extrude cursor gizmo, height label, bounding box.
 *   - Click or Enter to commit; Escape to cancel.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import { CursorGizmoDom, HeightLabelDom, BrushBoundingBoxGizmo } from "../brush/overlays";
import { HEIGHT_SENSITIVITY } from "../brush/constants";
import { getPositions, getIndices, groupFacesIntoPolygons, type FacePolygon } from "./helpers";
import type { SelectedElement } from "../../../store/modelingStore";

// ─── Preview geometry builder ─────────────────────────────────────────────────

/**
 * Build a BufferGeometry (in mesh local space) showing the selected faces
 * extruded by `amount` along their face normals, with side walls connecting
 * original edges to the displaced top face. Used for the interactive preview.
 */
function buildExtrudePreviewGeometry(
  geo: THREE.BufferGeometry,
  polygons: FacePolygon[],
  amount: number,
): THREE.BufferGeometry | null {
  if (polygons.length === 0 || Math.abs(amount) < 0.001) return null;

  const positions = getPositions(geo);
  const indices = getIndices(geo);
  if (!indices) return null;

  const pts: number[] = [];
  const idx: number[] = [];

  const getVert = (vi: number) =>
    new THREE.Vector3(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]);
  const pushVert = (v: THREE.Vector3) => pts.push(v.x, v.y, v.z);

  const addTriExtrusion = (pa: THREE.Vector3, pb: THREE.Vector3, pc: THREE.Vector3, n: THREE.Vector3) => {
    const pa2 = pa.clone().addScaledVector(n, amount);
    const pb2 = pb.clone().addScaledVector(n, amount);
    const pc2 = pc.clone().addScaledVector(n, amount);
    const base = pts.length / 3;
    pushVert(pa); pushVert(pb); pushVert(pc);   // 0,1,2 = original
    pushVert(pa2); pushVert(pb2); pushVert(pc2); // 3,4,5 = displaced
    // Top face (same CCW winding)
    idx.push(base + 3, base + 4, base + 5);
    // Bottom face (back-side of original, so it's visible inside)
    idx.push(base, base + 2, base + 1);
    // Side quads: a→b, b→c, c→a
    idx.push(base, base + 1, base + 4, base, base + 4, base + 3);
    idx.push(base + 1, base + 2, base + 5, base + 1, base + 5, base + 4);
    idx.push(base + 2, base, base + 3, base + 2, base + 3, base + 5);
  };

  for (const poly of polygons) {
    if (poly.kind === "tri") {
      const { faceIdx } = poly;
      const a = indices[faceIdx * 3], b = indices[faceIdx * 3 + 1], c = indices[faceIdx * 3 + 2];
      const pa = getVert(a), pb = getVert(b), pc = getVert(c);
      const n = new THREE.Vector3()
        .crossVectors(new THREE.Vector3().subVectors(pb, pa), new THREE.Vector3().subVectors(pc, pa))
        .normalize();
      addTriExtrusion(pa, pb, pc, n);
    } else {
      // quad — reconstruct the 4-vertex ring (same logic as extrudeQuadFace)
      const { faceIdxA, faceIdxB } = poly;
      const ia = [indices[faceIdxA * 3], indices[faceIdxA * 3 + 1], indices[faceIdxA * 3 + 2]];
      const ib = [indices[faceIdxB * 3], indices[faceIdxB * 3 + 1], indices[faceIdxB * 3 + 2]];

      const eps2 = 1e-8;
      const samePos = (a: number, b: number) =>
        getVert(a).distanceToSquared(getVert(b)) < eps2;

      const sharedA: number[] = [];
      for (const va of ia) {
        for (const vb of ib) {
          if (samePos(va, vb)) { sharedA.push(va); break; }
        }
      }

      if (sharedA.length !== 2) {
        // Degenerate quad — fall back to two separate triangles
        const faceNormalA = new THREE.Vector3()
          .crossVectors(
            getVert(ia[1]).sub(getVert(ia[0])),
            getVert(ia[2]).sub(getVert(ia[0])),
          )
          .normalize();
        addTriExtrusion(getVert(ia[0]), getVert(ia[1]), getVert(ia[2]), faceNormalA);
        addTriExtrusion(getVert(ib[0]), getVert(ib[1]), getVert(ib[2]), faceNormalA);
        continue;
      }

      const uA = ia.find((v) => !sharedA.includes(v))!;
      const uB = ib.find((v) => !sharedA.some((s) => samePos(s, v)))!;
      const [s0, s1] = sharedA;

      const faceNormalA = new THREE.Vector3()
        .crossVectors(
          new THREE.Vector3().subVectors(getVert(ia[1]), getVert(ia[0])),
          new THREE.Vector3().subVectors(getVert(ia[2]), getVert(ia[0])),
        )
        .normalize();

      // Order the 4 ring vertices CCW (viewed from faceNormalA)
      const crossTest = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(getVert(s0), getVert(uA)),
        new THREE.Vector3().subVectors(getVert(uB), getVert(uA)),
      );
      const ring: number[] = crossTest.dot(faceNormalA) >= 0
        ? [uA, s0, uB, s1]
        : [uA, s1, uB, s0];

      const ringVerts = ring.map(getVert);
      const extrudedVerts = ringVerts.map((p) => p.clone().addScaledVector(faceNormalA, amount));

      const base = pts.length / 3;
      for (const v of ringVerts) pushVert(v);     // 0-3 = original ring
      for (const v of extrudedVerts) pushVert(v); // 4-7 = displaced ring

      // Top face (2 triangles, same CCW winding)
      idx.push(base + 4, base + 5, base + 6, base + 4, base + 6, base + 7);
      // Bottom face
      idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
      // Side quads
      for (let i = 0; i < 4; i++) {
        const oi = base + i, oj = base + ((i + 1) % 4);
        const ei = base + 4 + i, ej = base + 4 + ((i + 1) % 4);
        idx.push(oi, oj, ej, oi, ej, ei);
      }
    }
  }

  if (pts.length === 0) return null;
  const previewGeo = new THREE.BufferGeometry();
  previewGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
  previewGeo.setIndex(idx);
  previewGeo.computeVertexNormals();
  return previewGeo;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExtrudeInteractiveGizmo({
  mesh,
  selectedElements,
  onCommit,
  onCancel,
}: {
  mesh: THREE.Mesh;
  selectedElements: SelectedElement[];
  onCommit: (amount: number) => void;
  onCancel: () => void;
}): React.JSX.Element | null {
  const { gl } = useThree();

  const [amount, setAmount] = useState(0);
  const [cursorScreen, setCursorScreen] = useState({ x: 0, y: 0 });
  const startYRef = useRef<number | null>(null);
  const amountRef = useRef(0);
  amountRef.current = amount;

  // Group selected face indices into tri/quad polygons
  const polygons = useMemo(() => {
    const faces = selectedElements.filter((el) => el.type === "face");
    if (faces.length === 0) return [];
    return groupFacesIntoPolygons(faces.map((el) => el.index), mesh.geometry);
  }, [mesh, selectedElements]);

  // World-space positions of all selected face vertices, for the bounding box gizmo
  const faceWorldPoints = useMemo(() => {
    const positions = getPositions(mesh.geometry);
    const indices = getIndices(mesh.geometry);
    if (!indices) return [];
    const pts: THREE.Vector3[] = [];
    for (const poly of polygons) {
      const vis =
        poly.kind === "tri"
          ? [indices[poly.faceIdx * 3], indices[poly.faceIdx * 3 + 1], indices[poly.faceIdx * 3 + 2]]
          : [
              indices[poly.faceIdxA * 3],
              indices[poly.faceIdxA * 3 + 1],
              indices[poly.faceIdxA * 3 + 2],
              indices[poly.faceIdxB * 3],
              indices[poly.faceIdxB * 3 + 1],
              indices[poly.faceIdxB * 3 + 2],
            ];
      for (const vi of vis) {
        pts.push(
          new THREE.Vector3(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]).applyMatrix4(
            mesh.matrixWorld,
          ),
        );
      }
    }
    return pts;
  }, [mesh, polygons]);

  // Preview geometry in local mesh space
  const previewGeo = useMemo(
    () => buildExtrudePreviewGeometry(mesh.geometry, polygons, amount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [polygons, amount],
  );

  // Canvas pointer events: move = update height, click = commit
  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setCursorScreen({ x: sx, y: sy });
      if (startYRef.current === null) startYRef.current = sy;
      const dy = startYRef.current - sy; // upward = positive
      setAmount(dy * HEIGHT_SENSITIVITY * 20);
    };

    const onClick = (e: MouseEvent) => {
      if (e.shiftKey) return; // shift = camera pan, ignore
      onCommit(amountRef.current);
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [gl, onCommit]);

  // Keyboard: Enter = commit, Escape = cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Enter") {
        onCommit(amountRef.current);
      } else if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCommit, onCancel]);

  return (
    <>
      {/* 3D preview mesh rendered in mesh local space via matrixWorld */}
      {previewGeo && (
        <group matrixAutoUpdate={false} matrix={mesh.matrixWorld}>
          <mesh geometry={previewGeo}>
            <meshBasicMaterial
              color="#5588ff"
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
              depthTest={false}
            />
          </mesh>
          <mesh geometry={previewGeo}>
            <meshBasicMaterial color="#88aaff" wireframe depthTest={false} />
          </mesh>
        </group>
      )}

      {/* DOM overlays — follow mouse */}
      <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="extrude" />
      <HeightLabelDom height={amount} screenX={cursorScreen.x} screenY={cursorScreen.y} />

      {/* Bounding box around selected faces (no height extension — normals aren't always Y-up) */}
      {faceWorldPoints.length >= 2 && (
        <BrushBoundingBoxGizmo points={faceWorldPoints} />
      )}
    </>
  );
}
