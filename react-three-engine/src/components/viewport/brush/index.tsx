import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import { sceneActions } from "../../../store/sceneStore";
import { useModelingStore, modelingActions } from "../../../store/modelingStore";
import { useSettingsStore, snapToGrid } from "../../../store/settingsStore";
import { HEIGHT_SENSITIVITY, SNAP_RADIUS_PX } from "./constants";
import { buildExtrudedGeometry, projectToFloor, triangulatePolygon, worldToScreenDist } from "./geometry";
import { CommittedLines, ExtrudePreview, PreviewLine, VertexDots } from "./primitives";
import { BrushBoundingBoxGizmo, CursorGizmoDom, DistanceLabelDom, GizmoVariant, HeightLabelDom } from "./overlays";
import { CubeBrushOverlay } from "./CubeBrush";
import { SlopeBrushOverlay } from "./SlopeBrush";

// ─── Main brush overlay ───────────────────────────────────────────────────────
export function BrushOverlay(): React.JSX.Element | null {
  const brushType = useModelingStore((s) => s.brushType);
  const { camera, gl } = useThree();

  // ── Shared polygon-draw state ──────────────────────────────────────────────
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  const [cursor, setCursor] = useState<THREE.Vector3 | null>(null);
  const [closingSnap, setClosingSnap] = useState(false);

  // ── Poly3D phase 2 state ───────────────────────────────────────────────────
  /** null = phase 1 (drawing). non-null = phase 2 (extruding). */
  const [extrudePoints, setExtrudePoints] = useState<THREE.Vector3[] | null>(null);
  const [extrudeHeight, setExtrudeHeight] = useState(0);
  /** Screen Y position when phase 2 started, for relative height calculation. */
  const extrudeStartYRef = useRef(0);
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const cursorScreenRef = useRef<THREE.Vector2>(new THREE.Vector2());

  const isPoly3D = brushType === "poly3d";
  const isPolygon = brushType === "polygon";
  const isActive = isPolygon || isPoly3D;

  // ── Reset on brush type change ─────────────────────────────────────────────
  useEffect(() => {
    setPoints([]);
    setCursor(null);
    setClosingSnap(false);
    setExtrudePoints(null);
    setExtrudeHeight(0);
    modelingActions.setBrushPhase(1);
    modelingActions.setBrushPointCount(0);
  }, [brushType]);

  // ── Sync brushPhase and brushPointCount to store ───────────────────────────
  useEffect(() => {
    const phase: 1 | 2 = extrudePoints !== null ? 2 : 1;
    modelingActions.setBrushPhase(phase);
  }, [extrudePoints]);

  useEffect(() => {
    modelingActions.setBrushPointCount(points.length);
  }, [points.length]);

  // ── Commit flat polygon (polygon brush) ───────────────────────────────────
  const commitPolygon = useCallback((pts: THREE.Vector3[]) => {
    if (pts.length < 3) return;
    const { vertices, indices } = triangulatePolygon(pts);
    if (vertices.length === 0) return;

    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(vertices);
    const count = posArr.length / 3;
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    geo.setIndex(indices);

    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);

    const normalArr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      normalArr[i * 3 + 1] = 1;
    }
    geo.setAttribute("normal", new THREE.BufferAttribute(normalArr, 3));
    geo.computeBoundingSphere();

    sceneActions.addMeshWithGeometry(geo, center);
    setPoints([]);
    setCursor(null);
    setClosingSnap(false);
  }, []);

  // ── Enter phase 2 for poly3D ───────────────────────────────────────────────
  const startExtrude = useCallback((pts: THREE.Vector3[], startScreenY: number) => {
    setExtrudePoints(pts);
    setExtrudeHeight(0);
    extrudeStartYRef.current = startScreenY;
    setPoints([]);
    setCursor(null);
    setClosingSnap(false);
  }, []);

  // ── Commit extruded mesh (poly3D phase 2) ─────────────────────────────────
  const commitExtrude = useCallback((pts: THREE.Vector3[], height: number) => {
    if (pts.length < 3 || Math.abs(height) < 0.001) return;
    const geo = buildExtrudedGeometry(pts, height);

    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeBoundingSphere();
    geo.userData.r3eEdited = true;

    sceneActions.addMeshWithGeometry(geo, center);
    setExtrudePoints(null);
    setExtrudeHeight(0);
  }, []);

  // ── Handle pointer events ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas || !isActive) return;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      cursorScreenRef.current.set(sx, sy);
      setCursorScreen({ x: sx, y: sy });

      // Phase 2: compute height from vertical mouse movement
      if (extrudePoints !== null) {
        const dy = extrudeStartYRef.current - sy; // upward = positive
        let h = dy * HEIGHT_SENSITIVITY * 20;
        const snap = useSettingsStore.getState().snap;
        if (snap.enabled && e.ctrlKey) h = snapToGrid(h, snap.brushStep);
        setExtrudeHeight(h);
        return;
      }

      // Phase 1: project to floor
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
      setCursor(hit);

      if (hit && points.length >= 3) {
        const dist = worldToScreenDist(points[0], cursorScreenRef.current, camera, canvas);
        setClosingSnap(dist < SNAP_RADIUS_PX);
      } else {
        setClosingSnap(false);
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Phase 2 click → confirm extrude
      if (extrudePoints !== null) {
        commitExtrude(extrudePoints, extrudeHeight);
        return;
      }

      // Phase 1 click
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
      if (!hit) return;

      setPoints((prev) => {
        if (prev.length >= 3) {
          const screenPt = new THREE.Vector2(sx, sy);
          const dist = worldToScreenDist(prev[0], screenPt, camera, canvas);
          if (dist < SNAP_RADIUS_PX) {
            // Close the polygon
            if (isPoly3D) {
              startExtrude(prev, sy);
            } else {
              commitPolygon(prev);
            }
            return [];
          }
        }
        return [...prev, hit];
      });
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [
    points,
    extrudePoints,
    extrudeHeight,
    camera,
    gl,
    raycaster,
    isActive,
    isPoly3D,
    commitPolygon,
    commitExtrude,
    startExtrude,
  ]);

  // ── Keyboard: Enter to commit, Escape to cancel ────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Enter") {
        if (extrudePoints !== null) {
          commitExtrude(extrudePoints, extrudeHeight);
        } else {
          commitPolygon(points);
        }
      } else if (e.key === "Escape") {
        setPoints([]);
        setCursor(null);
        setClosingSnap(false);
        setExtrudePoints(null);
        setExtrudeHeight(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [points, extrudePoints, extrudeHeight, isActive, commitPolygon, commitExtrude]);

  // Dedicated components — must be placed after all shared hooks above
  if (brushType === "cube") return <CubeBrushOverlay />;
  if (brushType === "slope") return <SlopeBrushOverlay />;

  if (!isActive) return null;

  // ── Phase 2 render (extrude preview) ──────────────────────────────────────
  if (extrudePoints !== null) {
    return (
      <>
        <ExtrudePreview points={extrudePoints} height={extrudeHeight} />
        {/* Floor outline of the committed polygon */}
        <CommittedLines points={[...extrudePoints, extrudePoints[0]]} />
        <VertexDots points={extrudePoints} />
        <HeightLabelDom height={extrudeHeight} screenX={cursorScreen.x} screenY={cursorScreen.y} />
        <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant="extrude" />
        <BrushBoundingBoxGizmo points={extrudePoints} height={extrudeHeight} />
      </>
    );
  }

  // ── Phase 1 render (polygon drawing) ──────────────────────────────────────
  const gizmoVariant: GizmoVariant = closingSnap ? "snap" : "crosshair";
  return (
    <>
      <CommittedLines points={points} />
      <VertexDots points={points} />
      <PreviewLine points={points} cursor={cursor} closingSnap={closingSnap} />
      <CursorGizmoDom screenX={cursorScreen.x} screenY={cursorScreen.y} variant={gizmoVariant} />
      {points.length >= 1 && cursor && (
        <DistanceLabelDom
          from={points[points.length - 1]}
          to={cursor}
          screenX={cursorScreen.x}
          screenY={cursorScreen.y}
        />
      )}
      {points.length >= 2 && <BrushBoundingBoxGizmo points={points} />}
    </>
  );
}
