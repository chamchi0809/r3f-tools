import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import { sceneActions } from "../../../store/sceneStore";
import { modelingActions } from "../../../store/modelingStore";
import { useSettingsStore, snapToGrid } from "../../../store/settingsStore";
import { BASE_PLANE_STEP, EXTRUDE_PREVIEW_COLOR, EXTRUDE_WIRE_COLOR, FLOOR_Y, HEIGHT_SENSITIVITY } from "./constants";
import { projectToFloor, rectPointsFromCorners } from "./geometry";
import { BasePlaneMesh, CommittedLines, VertexDots } from "./primitives";
import {
  BasePlaneYLabelDom,
  BrushBoundingBoxGizmo,
  CursorGizmoDom,
  DistanceLabelDom,
  HeightLabelDom,
} from "./overlays";
import { CubeRectPreview } from "./CubeBrush";

// ─── Slope Brush ──────────────────────────────────────────────────────────────

const SLOPE_DIR_COLOR = "#ff7744";

/** The four cardinal slope directions as XZ unit vectors (Vector2.y = world Z). */
const CARDINAL_DIRS = [
  new THREE.Vector2( 1,  0), // +X
  new THREE.Vector2( 0,  1), // +Z
  new THREE.Vector2(-1,  0), // -X
  new THREE.Vector2( 0, -1), // -Z
] as const;

/** Return index 0-3 of the cardinal direction closest to `dir`. */
function snapToCardinalIdx(dir: THREE.Vector2): number {
  const dlen = dir.length();
  if (dlen < 1e-5) return 0;
  const nx = dir.x / dlen;
  const nz = dir.y / dlen;
  let best = 0, bestDot = -Infinity;
  for (let i = 0; i < CARDINAL_DIRS.length; i++) {
    const dot = nx * CARDINAL_DIRS[i].x + nz * CARDINAL_DIRS[i].y;
    if (dot > bestDot) { bestDot = dot; best = i; }
  }
  return best;
}

/**
 * Shows all 4 cardinal direction arrows from the rect center, with the
 * currently snapped direction rendered bright and the others faint.
 */
function SlopeCardinalArrows({
  center,
  selectedIdx,
  radius,
}: {
  center: THREE.Vector3;
  selectedIdx: number;
  radius: number;
}) {
  const allGeo = useMemo(() => {
    const buf = new Float32Array(CARDINAL_DIRS.length * 6);
    CARDINAL_DIRS.forEach((dir, i) => {
      const base = i * 6;
      buf[base + 0] = center.x; buf[base + 1] = center.y + 0.01; buf[base + 2] = center.z;
      buf[base + 3] = center.x + dir.x * radius;
      buf[base + 4] = center.y + 0.01;
      buf[base + 5] = center.z + dir.y * radius;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(buf, 3));
    return g;
  }, [center, radius]);

  const selGeo = useMemo(() => {
    const dir = CARDINAL_DIRS[selectedIdx];
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([
          center.x, center.y + 0.01, center.z,
          center.x + dir.x * radius, center.y + 0.01, center.z + dir.y * radius,
        ]),
        3,
      ),
    );
    return g;
  }, [center, selectedIdx, radius]);

  return (
    <>
      <lineSegments geometry={allGeo}>
        <lineBasicMaterial color={SLOPE_DIR_COLOR} depthTest={false} transparent opacity={0.2} />
      </lineSegments>
      <lineSegments geometry={selGeo}>
        <lineBasicMaterial color={SLOPE_DIR_COLOR} depthTest={false} transparent opacity={0.95} />
      </lineSegments>
      <mesh position={[center.x, center.y + 0.01, center.z]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={SLOPE_DIR_COLOR} depthTest={false} />
      </mesh>
    </>
  );
}

/**
 * Build a ramp (wedge) BufferGeometry from a 4-corner floor rectangle, height,
 * and a slope direction vector (XZ plane). Each top vertex is assigned a height
 * proportional to its dot-product distance from the rect center in highDir,
 * so the result is a planar slope from 0 at the "low" edge to `height` at
 * the "high" edge.
 */
function buildSlopeGeometry(
  pts: THREE.Vector3[],
  height: number,
  highDir: THREE.Vector2,
): THREE.BufferGeometry {
  if (pts.length < 4) return new THREE.BufferGeometry();

  const cx = (pts[0].x + pts[2].x) / 2;
  const cz = (pts[0].z + pts[2].z) / 2;
  const dlen = Math.sqrt(highDir.x ** 2 + highDir.y ** 2);
  const dx = dlen > 1e-5 ? highDir.x / dlen : 1;
  const dz = dlen > 1e-5 ? highDir.y / dlen : 0;

  const dots = pts.map((p) => dx * (p.x - cx) + dz * (p.z - cz));
  const minDot = Math.min(...dots);
  const maxDot = Math.max(...dots);
  const range = maxDot - minDot;
  const topY = pts.map((_, i) =>
    range < 1e-5 ? height * 0.5 : ((dots[i] - minDot) / range) * height,
  );

  // B[i] = bottom corner, T[i] = top corner (same XZ, different Y).
  const baseY = pts.length > 0 ? pts[0].y : FLOOR_Y;
  const B = pts.map((p) => new THREE.Vector3(p.x, baseY, p.z));
  const T = pts.map((p, i) => new THREE.Vector3(p.x, baseY + topY[i], p.z));

  const pos: number[] = [];
  const idx: number[] = [];

  function tri(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx2: number, cy2: number, cz2: number,
  ) {
    const base = pos.length / 3;
    pos.push(ax, ay, az, bx, by, bz, cx2, cy2, cz2);
    idx.push(base, base + 1, base + 2);
  }

  // ── Bottom face (normal = -Y) ────────────────────────────────────────────
  tri(B[0].x, B[0].y, B[0].z,  B[1].x, B[1].y, B[1].z,  B[2].x, B[2].y, B[2].z);
  tri(B[0].x, B[0].y, B[0].z,  B[2].x, B[2].y, B[2].z,  B[3].x, B[3].y, B[3].z);

  // ── Slope top face (normal points outward-upward) ────────────────────────
  tri(T[0].x, T[0].y, T[0].z,  T[3].x, T[3].y, T[3].z,  T[2].x, T[2].y, T[2].z);
  tri(T[0].x, T[0].y, T[0].z,  T[2].x, T[2].y, T[2].z,  T[1].x, T[1].y, T[1].z);

  // ── Side walls ─────────────────────────────────────────────────────────────
  const sideEdges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]];
  for (const [i, j] of sideEdges) {
    const bi = B[i], bj = B[j], ti = T[i], tj = T[j];
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

/** Arrow from rect center in the slope's high direction. */
function SlopeDirectionArrow({
  center,
  highDir,
  radius,
}: {
  center: THREE.Vector3;
  highDir: THREE.Vector2;
  radius: number;
}) {
  const geo = useMemo(() => {
    const dlen = Math.sqrt(highDir.x ** 2 + highDir.y ** 2);
    if (dlen < 0.01) return null;
    const nx = highDir.x / dlen;
    const nz = highDir.y / dlen;
    const end = new THREE.Vector3(center.x + nx * radius, center.y + 0.01, center.z + nz * radius);
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([center.x, center.y + 0.01, center.z, end.x, end.y, end.z]),
        3,
      ),
    );
    return g;
  }, [center, highDir, radius]);

  if (!geo) return null;
  return (
    <>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color={SLOPE_DIR_COLOR} depthTest={false} transparent opacity={0.95} />
      </lineSegments>
      <mesh position={[center.x, center.y + 0.01, center.z]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={SLOPE_DIR_COLOR} depthTest={false} />
      </mesh>
    </>
  );
}

function SlopePreview({
  points,
  height,
  highDir,
}: {
  points: THREE.Vector3[];
  height: number;
  highDir: THREE.Vector2;
}) {
  const geo = useMemo(() => {
    if (points.length < 4 || Math.abs(height) < 0.001) return null;
    return buildSlopeGeometry(points, height, highDir);
  }, [points, height, highDir]);

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

/**
 * Slope Brush — 4-phase workflow:
 *   Phase 1: click to place the starting corner on the floor plane.
 *   Phase 2: move mouse to preview rectangular footprint; click to confirm.
 *   Phase 3: move mouse to pick one of 4 cardinal slope directions; click to confirm.
 *   Phase 4: move mouse up/down to set height; click or Enter to commit.
 */
export function SlopeBrushOverlay(): React.JSX.Element {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const [basePlaneY, setBasePlaneY] = useState(0);
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [startPoint, setStartPoint] = useState<THREE.Vector3 | null>(null);
  const [cursorFloor, setCursorFloor] = useState<THREE.Vector3 | null>(null);
  const [rectPoints, setRectPoints] = useState<THREE.Vector3[] | null>(null);
  const [selectedDirIdx, setSelectedDirIdx] = useState(0);
  const [highDir, setHighDir] = useState(() => new THREE.Vector2(1, 0));
  const [height, setHeight] = useState(0);
  const extrudeStartYRef = useRef(0);
  const [cursorScreen, setCursorScreen] = useState({ x: 0, y: 0 });

  // Sync to modeling store so Toolbar shows correct instructions
  useEffect(() => {
    if (phase === 4) {
      modelingActions.setBrushPhase(2);
      modelingActions.setBrushPointCount(2);
    } else if (phase === 3) {
      modelingActions.setBrushPhase(1);
      modelingActions.setBrushPointCount(3); // sentinel for direction phase
    } else if (phase === 2) {
      modelingActions.setBrushPhase(1);
      modelingActions.setBrushPointCount(1);
    } else {
      modelingActions.setBrushPhase(1);
      modelingActions.setBrushPointCount(0);
    }
  }, [phase]);

  const reset = useCallback(() => {
    setPhase(1);
    setStartPoint(null);
    setCursorFloor(null);
    setRectPoints(null);
    setSelectedDirIdx(0);
    setHighDir(new THREE.Vector2(1, 0));
    setHeight(0);
  }, []);

  const commitSlope = useCallback((pts: THREE.Vector3[], h: number, dir: THREE.Vector2) => {
    if (pts.length < 4 || Math.abs(h) < 0.001) return;
    const geo = buildSlopeGeometry(pts, h, dir);
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeBoundingSphere();
    geo.userData.r3eEdited = true;
    sceneActions.addMeshWithGeometry(geo, center);
    reset();
  }, [reset]);

  // Pointer events
  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const getFloorHit = (e: MouseEvent | PointerEvent): THREE.Vector3 | null => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const ndcX = (sx / rect.width) * 2 - 1;
      const ndcY = -(sy / rect.height) * 2 + 1;
      let hit = projectToFloor(new THREE.Vector2(ndcX, ndcY), camera, raycaster, basePlaneY);
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
      return hit;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setCursorScreen({ x: sx, y: sy });

      if (phase === 4) {
        const dy = extrudeStartYRef.current - sy;
        let h = dy * HEIGHT_SENSITIVITY * 20;
        const snap = useSettingsStore.getState().snap;
        if (snap.enabled && e.ctrlKey) h = snapToGrid(h, snap.brushStep);
        setHeight(h);
        return;
      }

      if (phase === 3 && rectPoints) {
        const hit = getFloorHit(e);
        if (hit) {
          setCursorFloor(hit);
          const cx = (rectPoints[0].x + rectPoints[2].x) / 2;
          const cz = (rectPoints[0].z + rectPoints[2].z) / 2;
          const dir = new THREE.Vector2(hit.x - cx, hit.z - cz);
          setSelectedDirIdx(snapToCardinalIdx(dir));
        }
        return;
      }

      const hit = getFloorHit(e);
      setCursorFloor(hit);
    };

    const onClick = (e: MouseEvent) => {
      if (e.shiftKey) return; // Shift held = camera pan mode
      const rect = canvas.getBoundingClientRect();
      const sy = e.clientY - rect.top;

      if (phase === 4) {
        commitSlope(rectPoints!, height, highDir);
        return;
      }

      if (phase === 3) {
        const confirmed = new THREE.Vector2(
          CARDINAL_DIRS[selectedDirIdx].x,
          CARDINAL_DIRS[selectedDirIdx].y,
        );
        setHighDir(confirmed);
        setPhase(4);
        extrudeStartYRef.current = sy;
        setHeight(0);
        return;
      }

      if (phase === 2) {
        if (!startPoint || !cursorFloor) return;
        const dx = Math.abs(startPoint.x - cursorFloor.x);
        const dz = Math.abs(startPoint.z - cursorFloor.z);
        if (dx < 0.001 || dz < 0.001) return;
        const pts = rectPointsFromCorners(startPoint, cursorFloor);
        const cx = (pts[0].x + pts[2].x) / 2;
        const cz = (pts[0].z + pts[2].z) / 2;
        const initDir = new THREE.Vector2(cursorFloor.x - cx, cursorFloor.z - cz);
        setSelectedDirIdx(snapToCardinalIdx(initDir));
        setRectPoints(pts);
        setPhase(3);
        return;
      }

      // Phase 1: place starting corner
      const hit = getFloorHit(e);
      if (!hit) return;
      setStartPoint(hit);
      setCursorFloor(hit);
      setPhase(2);
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [phase, startPoint, cursorFloor, rectPoints, selectedDirIdx, height, highDir, basePlaneY, camera, gl, raycaster, commitSlope]);

  // Keyboard: Enter to commit (phase 4), Escape to cancel, ArrowUp/Down for base plane (phase 1)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Escape") {
        reset();
      } else if (e.key === "Enter" && phase === 4 && rectPoints) {
        commitSlope(rectPoints, height, highDir);
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && phase === 1) {
        e.preventDefault();
        const delta = e.key === "ArrowUp" ? BASE_PLANE_STEP : -BASE_PLANE_STEP;
        setBasePlaneY((prev) => prev + delta);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, rectPoints, height, highDir, commitSlope, reset]);

  // Mouse wheel: adjust base plane Y (only in phase 1)
  useEffect(() => {
    const canvas = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      if (phase !== 1) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -BASE_PLANE_STEP : BASE_PLANE_STEP;
      setBasePlaneY((prev) => prev + delta);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [gl, phase]);

  // Phase 4: height setting (direction locked)
  if (phase === 4 && rectPoints) {
    const cx = (rectPoints[0].x + rectPoints[2].x) / 2;
    const cz = (rectPoints[0].z + rectPoints[2].z) / 2;
    const center = new THREE.Vector3(cx, rectPoints[0].y, cz);
    const w = Math.abs(rectPoints[2].x - rectPoints[0].x);
    const d = Math.abs(rectPoints[2].z - rectPoints[0].z);
    const radius = Math.sqrt(w * w + d * d) / 2;
    return (
      <>
        <SlopePreview points={rectPoints} height={height} highDir={highDir} />
        <CommittedLines points={[...rectPoints, rectPoints[0]]} />
        <VertexDots points={rectPoints} />
        <SlopeDirectionArrow center={center} highDir={highDir} radius={radius} />
        <HeightLabelDom height={height} screenX={cursorScreen.x} screenY={cursorScreen.y} />
        <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="extrude" />
        <BrushBoundingBoxGizmo points={rectPoints} height={height} />
      </>
    );
  }

  // Phase 3: cardinal direction picker
  if (phase === 3 && rectPoints) {
    const cx = (rectPoints[0].x + rectPoints[2].x) / 2;
    const cz = (rectPoints[0].z + rectPoints[2].z) / 2;
    const center = new THREE.Vector3(cx, rectPoints[0].y, cz);
    const w = Math.abs(rectPoints[2].x - rectPoints[0].x);
    const d = Math.abs(rectPoints[2].z - rectPoints[0].z);
    const radius = Math.sqrt(w * w + d * d) / 2;
    const previewHeight = Math.min(w, d) * 0.5;
    const previewDir = new THREE.Vector2(
      CARDINAL_DIRS[selectedDirIdx].x,
      CARDINAL_DIRS[selectedDirIdx].y,
    );
    return (
      <>
        <SlopePreview points={rectPoints} height={previewHeight} highDir={previewDir} />
        <CommittedLines points={[...rectPoints, rectPoints[0]]} />
        <VertexDots points={rectPoints} />
        <SlopeCardinalArrows center={center} selectedIdx={selectedDirIdx} radius={radius} />
        <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="crosshair" />
        <BrushBoundingBoxGizmo points={rectPoints} />
      </>
    );
  }

  // Phase 2: rectangular footprint preview (identical to cube brush)
  if (phase === 2 && startPoint && cursorFloor) {
    const pts = rectPointsFromCorners(startPoint, cursorFloor);
    return (
      <>
        <CubeRectPreview start={startPoint} cursor={cursorFloor} />
        <VertexDots points={pts} />
        <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="crosshair" />
        <DistanceLabelDom
          from={startPoint}
          to={cursorFloor}
          screenX={cursorScreen.x}
          screenY={cursorScreen.y}
        />
        <BrushBoundingBoxGizmo points={pts} />
      </>
    );
  }

  // Phase 1: waiting for first click — show base plane + cursor gizmo
  return (
    <>
      <BasePlaneMesh y={basePlaneY} />
      <BasePlaneYLabelDom y={basePlaneY} screenX={cursorScreen.x} screenY={cursorScreen.y} />
      <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="crosshair" />
    </>
  );
}
