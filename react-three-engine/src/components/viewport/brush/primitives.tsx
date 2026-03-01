import React, { useMemo } from "react";
import * as THREE from "three/webgpu";
import {
  CLOSE_SNAP_COLOR,
  EXTRUDE_PREVIEW_COLOR,
  EXTRUDE_WIRE_COLOR,
  LINE_COLOR,
  POINT_COLOR,
  PREVIEW_COLOR,
} from "./constants";
import { buildExtrudedGeometry } from "./geometry";

// ─── Preview line geometry (follows cursor) ───────────────────────────────────

export function PreviewLine({
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

export function CommittedLines({ points }: { points: THREE.Vector3[] }) {
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

export function VertexDots({ points }: { points: THREE.Vector3[] }) {
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

export function ExtrudePreview({ points, height }: { points: THREE.Vector3[]; height: number }) {
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
