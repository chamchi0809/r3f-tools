import React, { useCallback, useEffect, useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import { css } from "@emotion/css";

// ─── Shared animation state (written by DOM, read by R3F loop) ────────────────

export const gizmoState = {
  animating: false,
  startTime: 0,
  duration: 300,
  startPosition: new THREE.Vector3(),
  targetPosition: new THREE.Vector3(),
};

// ─── Axis config ──────────────────────────────────────────────────────────────

const AXES = [
  { id: "+x", label: "X", color: "#e8394a", dir: new THREE.Vector3(1, 0, 0) },
  { id: "+y", label: "Y", color: "#7ecf00", dir: new THREE.Vector3(0, 1, 0) },
  { id: "+z", label: "Z", color: "#2b8fff", dir: new THREE.Vector3(0, 0, 1) },
  { id: "-x", label: "",  color: "#6b1520", dir: new THREE.Vector3(-1, 0, 0) },
  { id: "-y", label: "",  color: "#2a5200", dir: new THREE.Vector3(0, -1, 0) },
  { id: "-z", label: "",  color: "#0a2d66", dir: new THREE.Vector3(0, 0, -1) },
];

// Radius of the gizmo circle in pixels
const GIZMO_R = 28;
// Dot size in pixels
const DOT_R = 7;

// ─── Module-level DOM state updated from R3F loop (avoids React re-renders) ──

type AxisScreenState = {
  x: number; // -1..1 in gizmo space
  y: number;
  depth: number; // for z-ordering
};

const axisScreenState: Record<string, AxisScreenState> = {};
for (const a of AXES) axisScreenState[a.id] = { x: 0, y: 0, depth: 0 };

// Refs to the individual axis DOM elements, updated imperatively
const axisDomRefs: Record<string, HTMLDivElement | null> = {};
const lineDomRefs: Record<string, HTMLDivElement | null> = {};

// ─── Styles ───────────────────────────────────────────────────────────────────

const containerStyle = css`
  position: absolute;
  top: 10px;
  right: 10px;
  width: ${GIZMO_R * 2 + DOT_R * 2 + 4}px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  user-select: none;
  z-index: 1000;
`;

const canvasWrapStyle = css`
  position: relative;
  width: ${GIZMO_R * 2 + DOT_R * 2 + 4}px;
  height: ${GIZMO_R * 2 + DOT_R * 2 + 4}px;
  background: rgba(0, 0, 0, 0.42);
  border-radius: 50%;
`;

const labelStyle = css`
  font-family: monospace;
  font-size: 10px;
  color: #bbb;
  cursor: pointer;
  pointer-events: auto;
  background: rgba(0, 0, 0, 0.42);
  padding: 2px 8px;
  border-radius: 4px;
  &:hover { color: #fff; }
`;

// ─── R3F Animator ─────────────────────────────────────────────────────────────

export const ViewportGizmoAnimator: React.FC<{
  controlsRef: React.RefObject<any>;
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
}> = ({ controlsRef, cameraRef }) => {
  const { camera, invalidate } = useThree();

  // Always expose camera to DOM side
  cameraRef.current = camera;

  const _dir = new THREE.Vector3();
  const _mat = new THREE.Matrix4();

  useFrame(() => {
    // ── 1. Project axes into gizmo screen space ──────────────────────────────
    // Extract only the rotation part of the camera matrix (ignore position/fov)
    _mat.extractRotation(camera.matrixWorldInverse);

    for (const axis of AXES) {
      _dir.copy(axis.dir).applyMatrix4(_mat);
      // _dir.x / _dir.y are now -1..1 relative to camera rotation
      // Flip Y because screen Y is down
      axisScreenState[axis.id] = { x: _dir.x, y: -_dir.y, depth: _dir.z };
    }

    // ── 2. Update DOM imperatively (no React state = no re-render) ───────────
    // Sort axes back-to-front for z-index
    const sorted = AXES.slice().sort(
      (a, b) => axisScreenState[a.id].depth - axisScreenState[b.id].depth
    );

    const cx = GIZMO_R + DOT_R + 2; // center of canvas wrap in px
    const cy = GIZMO_R + DOT_R + 2;

    sorted.forEach((axis, i) => {
      const s = axisScreenState[axis.id];
      const px = cx + s.x * GIZMO_R;
      const py = cy + s.y * GIZMO_R;

      // Fade back-facing axes
      const alpha = 0.35 + 0.65 * ((s.depth + 1) / 2);

      const dotEl = axisDomRefs[axis.id];
      if (dotEl) {
        dotEl.style.left = `${px - DOT_R}px`;
        dotEl.style.top = `${py - DOT_R}px`;
        dotEl.style.zIndex = String(i);
        dotEl.style.opacity = String(alpha.toFixed(2));
      }

      // Lines from center to dot (only positive axes)
      const lineEl = lineDomRefs[axis.id];
      if (lineEl && axis.id.startsWith("+")) {
        const dx = s.x * GIZMO_R;
        const dy = s.y * GIZMO_R;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        lineEl.style.left = `${cx}px`;
        lineEl.style.top = `${cy}px`;
        lineEl.style.width = `${len}px`;
        lineEl.style.transform = `rotate(${angle}deg)`;
        lineEl.style.opacity = String((alpha * 0.6).toFixed(2));
        lineEl.style.zIndex = String(i);
      }
    });

    // ── 3. Camera animation ──────────────────────────────────────────────────
    if (gizmoState.animating) {
      const progress = Math.min(
        (performance.now() - gizmoState.startTime) / gizmoState.duration,
        1,
      );
      const t = 1 - Math.pow(1 - progress, 3); // ease-out cubic

      camera.position
        .copy(gizmoState.startPosition)
        .lerp(gizmoState.targetPosition, t);

      if (controlsRef.current) {
        camera.lookAt(controlsRef.current.target);
        controlsRef.current.update();
      }

      invalidate();

      if (progress >= 1) gizmoState.animating = false;
    }
  });

  return null;
};

// ─── DOM Overlay ──────────────────────────────────────────────────────────────

export const ViewportGizmo: React.FC<{
  cameraRef: React.RefObject<THREE.Camera | null>;
  controlsRef: React.RefObject<any>;
}> = ({ cameraRef, controlsRef }) => {
  const [isOrtho, setIsOrtho] = useState(false);

  const handleAxisClick = useCallback(
    (dir: THREE.Vector3) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const dist = camera.position.distanceTo(controls.target);
      const newPos = controls.target
        .clone()
        .add(dir.clone().multiplyScalar(dist));

      gizmoState.startPosition.copy(camera.position);
      gizmoState.targetPosition.copy(newPos);
      gizmoState.startTime = performance.now();
      gizmoState.animating = true;
    },
    [cameraRef, controlsRef],
  );

  const handleToggleOrtho = useCallback(() => {
    const camera = cameraRef.current as THREE.PerspectiveCamera | null;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const next = !isOrtho;
    setIsOrtho(next);

    const dist = camera.position.distanceTo(controls.target);
    if (next) {
      // Fake ortho: zoom way out + narrow FOV
      camera.fov = 1;
      camera.updateProjectionMatrix();
      gizmoState.startPosition.copy(camera.position);
      const dir = camera.position.clone().sub(controls.target).normalize();
      gizmoState.targetPosition
        .copy(controls.target)
        .add(dir.multiplyScalar(dist * 50));
      gizmoState.startTime = performance.now();
      gizmoState.animating = true;
    } else {
      // Restore perspective
      camera.fov = 60;
      camera.updateProjectionMatrix();
      gizmoState.startPosition.copy(camera.position);
      const dir = camera.position.clone().sub(controls.target).normalize();
      gizmoState.targetPosition
        .copy(controls.target)
        .add(dir.multiplyScalar(dist / 50));
      gizmoState.startTime = performance.now();
      gizmoState.animating = true;
    }
  }, [isOrtho, cameraRef, controlsRef]);

  return (
    <div className={containerStyle}>
      <div className={canvasWrapStyle}>
        {/* Lines (positive axes only) */}
        {AXES.filter((a) => a.id.startsWith("+")).map((axis) => (
          <div
            key={`line-${axis.id}`}
            ref={(el) => { lineDomRefs[axis.id] = el; }}
            style={{
              position: "absolute",
              height: "2px",
              transformOrigin: "0 50%",
              background: axis.color,
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Axis dots */}
        {AXES.map((axis) => (
          <div
            key={axis.id}
            ref={(el) => { axisDomRefs[axis.id] = el; }}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleAxisClick(axis.dir);
            }}
            style={{
              position: "absolute",
              width: DOT_R * 2,
              height: DOT_R * 2,
              borderRadius: "50%",
              background: axis.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 8,
              fontWeight: "bold",
              fontFamily: "sans-serif",
              color: "white",
              cursor: "pointer",
              pointerEvents: "auto",
              boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
            }}
          >
            {axis.label}
          </div>
        ))}

        {/* Center dot */}
        <div
          style={{
            position: "absolute",
            left: GIZMO_R + DOT_R + 2 - 4,
            top: GIZMO_R + DOT_R + 2 - 4,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#888",
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
      </div>

      {/* Persp / Ortho toggle */}
      <div className={labelStyle} onMouseDown={handleToggleOrtho}>
        {isOrtho ? "Ortho" : "Persp"}
      </div>
    </div>
  );
};
