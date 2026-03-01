import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import { sceneActions } from "../../../store/sceneStore";
import { modelingActions } from "../../../store/modelingStore";
import { useSettingsStore, snapToGrid } from "../../../store/settingsStore";
import { HEIGHT_SENSITIVITY, EXTRUDE_WIRE_COLOR } from "./constants";
import { buildExtrudedGeometry, projectToFloor, rectPointsFromCorners } from "./geometry";
import { CommittedLines, ExtrudePreview, VertexDots } from "./primitives";
import {
  BrushBoundingBoxGizmo,
  CursorGizmoDom,
  DistanceLabelDom,
  HeightLabelDom,
} from "./overlays";

// ─── Cube rect preview (phase 2 of cube brush) ───────────────────────────────

export function CubeRectPreview({ start, cursor }: { start: THREE.Vector3; cursor: THREE.Vector3 }) {
  const geo = useMemo(() => {
    const pts = rectPointsFromCorners(start, cursor);
    // 4 edges: 0→1, 1→2, 2→3, 3→0
    const buf = new Float32Array(8 * 3);
    const edges = [0, 1, 1, 2, 2, 3, 3, 0];
    for (let i = 0; i < 8; i++) {
      const p = pts[edges[i]];
      buf[i * 3] = p.x;
      buf[i * 3 + 1] = p.y;
      buf[i * 3 + 2] = p.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(buf, 3));
    return g;
  }, [start, cursor]);

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={EXTRUDE_WIRE_COLOR} depthTest={false} transparent opacity={0.8} />
    </lineSegments>
  );
}

// ─── Cube Brush Overlay ───────────────────────────────────────────────────────

/**
 * Cube Brush — 3-phase workflow:
 *   Phase 1: click to place the starting corner on the floor plane.
 *   Phase 2: move mouse to preview the rectangular footprint; click to confirm.
 *   Phase 3: move mouse up/down to set height; click (or Enter) to commit.
 */
export function CubeBrushOverlay(): React.JSX.Element {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const [phase, setPhase] = useState<1 | 2 | 3>(1);
  const [startPoint, setStartPoint] = useState<THREE.Vector3 | null>(null);
  const [cursorFloor, setCursorFloor] = useState<THREE.Vector3 | null>(null);
  const [rectPoints, setRectPoints] = useState<THREE.Vector3[] | null>(null);
  const [height, setHeight] = useState(0);
  const extrudeStartYRef = useRef(0);
  const [cursorScreen, setCursorScreen] = useState({ x: 0, y: 0 });

  // Sync phase → modeling store so Toolbar can show correct instructions
  useEffect(() => {
    if (phase === 3) {
      modelingActions.setBrushPhase(2);
      modelingActions.setBrushPointCount(2);
    } else if (phase === 2) {
      modelingActions.setBrushPhase(1);
      modelingActions.setBrushPointCount(1);
    } else {
      modelingActions.setBrushPhase(1);
      modelingActions.setBrushPointCount(0);
    }
  }, [phase]);

  const commitCube = useCallback((pts: THREE.Vector3[], h: number) => {
    if (pts.length < 3 || Math.abs(h) < 0.001) return;
    const geo = buildExtrudedGeometry(pts, h);
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeBoundingSphere();
    geo.userData.r3eEdited = true;
    sceneActions.addMeshWithGeometry(geo, center);
    setPhase(1);
    setStartPoint(null);
    setCursorFloor(null);
    setRectPoints(null);
    setHeight(0);
  }, []);

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
      return hit;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setCursorScreen({ x: sx, y: sy });

      if (phase === 3) {
        const dy = extrudeStartYRef.current - sy; // upward = positive
        let h = dy * HEIGHT_SENSITIVITY * 20;
        const snap = useSettingsStore.getState().snap;
        if (snap.enabled && e.ctrlKey) h = snapToGrid(h, snap.brushStep);
        setHeight(h);
        return;
      }

      const hit = getFloorHit(e);
      setCursorFloor(hit);
    };

    const onClick = (e: MouseEvent) => {
      if (e.shiftKey) return; // Shift held = camera pan mode
      const rect = canvas.getBoundingClientRect();
      const sy = e.clientY - rect.top;

      if (phase === 3) {
        commitCube(rectPoints!, height);
        return;
      }

      if (phase === 2) {
        if (!startPoint || !cursorFloor) return;
        const dx = Math.abs(startPoint.x - cursorFloor.x);
        const dz = Math.abs(startPoint.z - cursorFloor.z);
        if (dx < 0.001 || dz < 0.001) return; // degenerate rect — ignore
        const pts = rectPointsFromCorners(startPoint, cursorFloor);
        setRectPoints(pts);
        setPhase(3);
        extrudeStartYRef.current = sy;
        setHeight(0);
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
  }, [phase, startPoint, cursorFloor, rectPoints, height, camera, gl, raycaster, commitCube]);

  // Keyboard: Enter to commit, Escape to cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Escape") {
        setPhase(1);
        setStartPoint(null);
        setCursorFloor(null);
        setRectPoints(null);
        setHeight(0);
      } else if (e.key === "Enter" && phase === 3 && rectPoints) {
        commitCube(rectPoints, height);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, rectPoints, height, commitCube]);

  // Phase 3: extrude height preview
  if (phase === 3 && rectPoints) {
    return (
      <>
        <ExtrudePreview points={rectPoints} height={height} />
        <CommittedLines points={[...rectPoints, rectPoints[0]]} />
        <VertexDots points={rectPoints} />
        <HeightLabelDom height={height} screenX={cursorScreen.x} screenY={cursorScreen.y} />
        <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="extrude" />
        <BrushBoundingBoxGizmo points={rectPoints} height={height} />
      </>
    );
  }

  // Phase 2: rectangular footprint preview
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

  // Phase 1: waiting for first click — just show cursor gizmo
  return (
    <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="crosshair" />
  );
}
