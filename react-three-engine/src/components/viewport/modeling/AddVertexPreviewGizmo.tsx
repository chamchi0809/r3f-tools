import { useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";

export type AddVertexHitType = "edge" | "face";

/**
 * Renders a preview gizmo at the cursor's world-space position when the user is
 * hovering over a mesh element in "add vertex" mode.
 *
 * Visual elements:
 *   • A pulsing billboard ring (same style as VertexHoverGizmo) in green.
 *   • A small inner cross ("+") to distinguish it from the plain hover ring.
 *   • A DOM label ("+ on Edge" / "+ on Face") that follows the cursor in
 *     screen space, anchored 16 px below the projected point.
 */
export function AddVertexPreviewGizmo({
  worldPoint,
  hitType,
}: {
  worldPoint: THREE.Vector3;
  hitType: AddVertexHitType;
}) {
  const { camera, size, gl } = useThree();
  const ringRef = useRef<THREE.Mesh>(null!);
  const labelRef = useRef<HTMLDivElement | null>(null);

  // ── DOM label ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const div = document.createElement("div");
    Object.assign(div.style, {
      position: "fixed",
      zIndex: "9999",
      pointerEvents: "none",
      transform: "translate(-50%, 0)",
      background: "rgba(0,0,0,0.78)",
      border: "1px solid #44ff8866",
      borderRadius: "4px",
      padding: "2px 8px",
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#44ff88",
      userSelect: "none",
      whiteSpace: "nowrap",
    });
    document.body.appendChild(div);
    labelRef.current = div;
    return () => {
      document.body.removeChild(div);
      labelRef.current = null;
    };
  }, []);

  // Update label text whenever hitType changes
  useEffect(() => {
    if (labelRef.current) {
      labelRef.current.textContent = hitType === "edge" ? "+ on Edge" : "+ on Face";
    }
  }, [hitType]);

  // ── Per-frame: billboard ring + project label ──────────────────────────────
  useFrame(() => {
    const ring = ringRef.current;
    if (!ring) return;

    // Billboard
    ring.quaternion.copy(camera.quaternion);

    // Scale so the ring stays a constant screen-space size (~20 px radius)
    const dist = camera.position.distanceTo(worldPoint);
    const fovRad = ((camera as THREE.PerspectiveCamera).fov ?? 60) * (Math.PI / 180);
    const worldRadius = (20 * dist * 2 * Math.tan(fovRad / 2)) / size.height;
    ring.scale.setScalar(worldRadius);

    // Project world point → screen for DOM label
    const label = labelRef.current;
    if (!label) return;
    const ndc = worldPoint.clone().project(camera);
    if (ndc.z > 1) {
      label.style.display = "none";
      return;
    }
    const rect = gl.domElement.getBoundingClientRect();
    const sx = rect.left + (ndc.x * 0.5 + 0.5) * size.width;
    const sy = rect.top + (1 - (ndc.y * 0.5 + 0.5)) * size.height;
    label.style.display = "";
    label.style.left = `${sx}px`;
    label.style.top = `${sy + 18}px`;
  });

  return (
    <group position={worldPoint}>
      {/* Outer billboard ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.72, 1.0, 32]} />
        <meshBasicMaterial
          color="#44ff88"
          transparent
          opacity={0.85}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Inner "+" cross — two thin quads, always facing camera */}
      <AddCross scale={worldPoint} />
    </group>
  );
}

/** Two small quads forming a "+" shape, billboarded. */
function AddCross({ scale: worldPoint }: { scale: THREE.Vector3 }) {
  const { camera, size } = useThree();
  const hRef = useRef<THREE.Mesh>(null!);
  const vRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    const dist = camera.position.distanceTo(worldPoint);
    const fovRad = ((camera as THREE.PerspectiveCamera).fov ?? 60) * (Math.PI / 180);
    const s = (14 * dist * 2 * Math.tan(fovRad / 2)) / size.height;
    for (const m of [hRef.current, vRef.current]) {
      if (!m) continue;
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar(s);
    }
  });

  return (
    <>
      {/* horizontal bar */}
      <mesh ref={hRef}>
        <planeGeometry args={[1.0, 0.15]} />
        <meshBasicMaterial color="#44ff88" depthTest={false} side={THREE.DoubleSide} />
      </mesh>
      {/* vertical bar */}
      <mesh ref={vRef}>
        <planeGeometry args={[0.15, 1.0]} />
        <meshBasicMaterial color="#44ff88" depthTest={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}
