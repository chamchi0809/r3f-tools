import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import { sceneActions } from "../../../store/sceneStore";
import { modelingActions } from "../../../store/modelingStore";
import { useSettingsStore, snapToGrid } from "../../../store/settingsStore";
import { BASE_PLANE_STEP, EXTRUDE_PREVIEW_COLOR, EXTRUDE_WIRE_COLOR, HEIGHT_SENSITIVITY } from "./constants";
import { isModKey } from "../../../utils/platform";
import { buildStairGeometry, projectToFloor, rectPointsFromCorners } from "./geometry";
import { BasePlaneMesh, CommittedLines, VertexDots } from "./primitives";
import {
  BasePlaneYLabelDom,
  BrushBoundingBoxGizmo,
  CursorGizmoDom,
  DistanceLabelDom,
  HeightLabelDom,
} from "./overlays";
import { CubeRectPreview } from "./CubeBrush";

// ─── Constants ────────────────────────────────────────────────────────────────

const STAIR_DIR_COLOR = "#ff9944";
const DEFAULT_STEP_COUNT = 5;
const MIN_STEPS = 1;
const MAX_STEPS = 20;

/** The four cardinal slope directions as XZ unit vectors (Vector2.y = world Z). */
const CARDINAL_DIRS = [
  new THREE.Vector2( 1,  0), // +X
  new THREE.Vector2( 0,  1), // +Z
  new THREE.Vector2(-1,  0), // -X
  new THREE.Vector2( 0, -1), // -Z
] as const;

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

// ─── Cardinal direction arrows ────────────────────────────────────────────────

function StairCardinalArrows({
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
        <lineBasicMaterial color={STAIR_DIR_COLOR} depthTest={false} transparent opacity={0.2} />
      </lineSegments>
      <lineSegments geometry={selGeo}>
        <lineBasicMaterial color={STAIR_DIR_COLOR} depthTest={false} transparent opacity={0.95} />
      </lineSegments>
      <mesh position={[center.x, center.y + 0.01, center.z]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={STAIR_DIR_COLOR} depthTest={false} />
      </mesh>
    </>
  );
}

// ─── Step count DOM label ─────────────────────────────────────────────────────

function StepCountLabelDom({
  stepCount,
  screenX,
  screenY,
}: {
  stepCount: number;
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
      color: STAIR_DIR_COLOR,
      fontFamily: "monospace",
      fontSize: "12px",
      padding: "2px 6px",
      borderRadius: "3px",
      whiteSpace: "nowrap",
      userSelect: "none",
    });
    document.body.appendChild(div);
    elRef.current = div;
    return () => { document.body.removeChild(div); };
  }, []);

  useEffect(() => {
    if (!elRef.current) return;
    const rect = gl.domElement.getBoundingClientRect();
    elRef.current.style.left = `${rect.left + screenX + 14}px`;
    elRef.current.style.top = `${rect.top + screenY + 8}px`;
    elRef.current.textContent = `Steps: ${stepCount}  (scroll to adjust)`;
  });

  return null;
}

// ─── Stair preview mesh ───────────────────────────────────────────────────────

function StairPreview({
  points,
  height,
  highDir,
  stepCount,
}: {
  points: THREE.Vector3[];
  height: number;
  highDir: THREE.Vector2;
  stepCount: number;
}) {
  const geo = useMemo(() => {
    if (points.length < 4 || Math.abs(height) < 0.001) return null;
    return buildStairGeometry(points, height, highDir, stepCount);
  }, [points, height, highDir, stepCount]);

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

// ─── Direction arrow ──────────────────────────────────────────────────────────

function StairDirectionArrow({
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
        <lineBasicMaterial color={STAIR_DIR_COLOR} depthTest={false} transparent opacity={0.95} />
      </lineSegments>
      <mesh position={[center.x, center.y + 0.01, center.z]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshBasicMaterial color={STAIR_DIR_COLOR} depthTest={false} />
      </mesh>
    </>
  );
}

// ─── Stair Brush Overlay ──────────────────────────────────────────────────────

/**
 * Stair Brush — 4-phase workflow:
 *   Phase 1: click to place the starting corner on the floor plane.
 *   Phase 2: move mouse to preview the rectangular footprint; click to confirm.
 *   Phase 3: move mouse to pick one of 4 cardinal stair directions;
 *             scroll wheel to increase/decrease step count (default 5); click to confirm.
 *   Phase 4: move mouse up/down to set total height; click or Enter to commit.
 */
export function StairBrushOverlay(): React.JSX.Element {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const [basePlaneY, setBasePlaneY] = useState(0);
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [startPoint, setStartPoint] = useState<THREE.Vector3 | null>(null);
  const [cursorFloor, setCursorFloor] = useState<THREE.Vector3 | null>(null);
  const [rectPoints, setRectPoints] = useState<THREE.Vector3[] | null>(null);
  const [selectedDirIdx, setSelectedDirIdx] = useState(0);
  const [highDir, setHighDir] = useState(() => new THREE.Vector2(1, 0));
  const [stepCount, setStepCount] = useState(DEFAULT_STEP_COUNT);
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
      modelingActions.setBrushPointCount(3); // sentinel for direction/step phase
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
    setStepCount(DEFAULT_STEP_COUNT);
    setHeight(0);
  }, []);

  const commitStair = useCallback(
    (pts: THREE.Vector3[], h: number, dir: THREE.Vector2, steps: number) => {
      if (pts.length < 4 || Math.abs(h) < 0.001) return;
      const geo = buildStairGeometry(pts, h, dir, steps);
      geo.computeBoundingBox();
      const center = new THREE.Vector3();
      geo.boundingBox!.getCenter(center);
      geo.translate(-center.x, -center.y, -center.z);
      geo.computeBoundingSphere();
      geo.userData.r3eEdited = true;
      sceneActions.addMeshWithGeometry(geo, center);
      reset();
    },
    [reset],
  );

  // Pointer + wheel events
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
        if (snap.enabled && isModKey(e)) {
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
        if (snap.enabled && isModKey(e)) h = snapToGrid(h, snap.brushStep);
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
        commitStair(rectPoints!, height, highDir, stepCount);
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

    const onWheel = (e: WheelEvent) => {
      if (phase === 3) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        setStepCount((prev) => Math.max(MIN_STEPS, Math.min(MAX_STEPS, prev + delta)));
      } else if (phase === 1) {
        e.preventDefault();
        const planeDelta = e.deltaY > 0 ? -BASE_PLANE_STEP : BASE_PLANE_STEP;
        setBasePlaneY((prev) => prev + planeDelta);
      }
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [phase, startPoint, cursorFloor, rectPoints, selectedDirIdx, height, highDir, stepCount, basePlaneY, camera, gl, raycaster, commitStair]);

  // Keyboard: Enter to commit (phase 4), Escape to cancel, ArrowUp/Down for base plane (phase 1)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Escape") {
        reset();
      } else if (e.key === "Enter" && phase === 4 && rectPoints) {
        commitStair(rectPoints, height, highDir, stepCount);
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && phase === 1) {
        e.preventDefault();
        const delta = e.key === "ArrowUp" ? BASE_PLANE_STEP : -BASE_PLANE_STEP;
        setBasePlaneY((prev) => prev + delta);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, rectPoints, height, highDir, stepCount, commitStair, reset]);

  // ── Phase 4: height setting ────────────────────────────────────────────────
  if (phase === 4 && rectPoints) {
    const cx = (rectPoints[0].x + rectPoints[2].x) / 2;
    const cz = (rectPoints[0].z + rectPoints[2].z) / 2;
    const center = new THREE.Vector3(cx, rectPoints[0].y, cz);
    const w = Math.abs(rectPoints[2].x - rectPoints[0].x);
    const d = Math.abs(rectPoints[2].z - rectPoints[0].z);
    const radius = Math.sqrt(w * w + d * d) / 2;
    return (
      <>
        <StairPreview points={rectPoints} height={height} highDir={highDir} stepCount={stepCount} />
        <CommittedLines points={[...rectPoints, rectPoints[0]]} />
        <VertexDots points={rectPoints} />
        <StairDirectionArrow center={center} highDir={highDir} radius={radius} />
        <HeightLabelDom height={height} screenX={cursorScreen.x} screenY={cursorScreen.y} />
        <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="extrude" />
        <BrushBoundingBoxGizmo points={rectPoints} height={height} />
      </>
    );
  }

  // ── Phase 3: direction + step count picker ─────────────────────────────────
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
        <StairPreview points={rectPoints} height={previewHeight} highDir={previewDir} stepCount={stepCount} />
        <CommittedLines points={[...rectPoints, rectPoints[0]]} />
        <VertexDots points={rectPoints} />
        <StairCardinalArrows center={center} selectedIdx={selectedDirIdx} radius={radius} />
        <StepCountLabelDom stepCount={stepCount} screenX={cursorScreen.x} screenY={cursorScreen.y} />
        <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="crosshair" />
        <BrushBoundingBoxGizmo points={rectPoints} />
      </>
    );
  }

  // ── Phase 2: rectangular footprint preview ─────────────────────────────────
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

  // ── Phase 1: waiting for first click — show base plane + cursor gizmo ─────
  return (
    <>
      <BasePlaneMesh y={basePlaneY} />
      <BasePlaneYLabelDom y={basePlaneY} screenX={cursorScreen.x} screenY={cursorScreen.y} />
      <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="crosshair" />
    </>
  );
}
