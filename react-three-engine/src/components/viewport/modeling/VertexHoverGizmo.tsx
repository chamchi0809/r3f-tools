import { useFrame, useThree } from "@react-three/fiber";
import React, { useRef } from "react";
import * as THREE from "three/webgpu";
import { VERTEX_SCREEN_HIT_PX, VERTEX_COLOR_SELECTED, VERTEX_COLOR_HOVERABLE } from "./constants";

const C_HOVERABLE = new THREE.Color(VERTEX_COLOR_HOVERABLE);
const C_SELECTED = new THREE.Color(VERTEX_COLOR_SELECTED);

/**
 * Camera-facing ring rendered at the hovered vertex's WORLD position (outside
 * the local-space mesh group). Scales each frame so its screen-space radius
 * always matches VERTEX_SCREEN_HIT_PX, giving the user clear visual feedback
 * about how large the selection zone is.
 *
 * Driven imperatively via `stateRef` to avoid triggering React re-renders in
 * the parent (ModelingOverlay) on every vertex hover change.
 */
export function VertexHoverGizmo({
  stateRef,
}: {
  stateRef: React.MutableRefObject<{ pos: THREE.Vector3; isSelected: boolean } | null>;
}) {
  const { camera, size } = useThree();
  const ref = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const state = stateRef.current;
    if (!state) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.position.copy(state.pos);
    // Billboard: orient ring to always face the camera
    m.quaternion.copy(camera.quaternion);
    // Scale so the ring's radius equals VERTEX_SCREEN_HIT_PX pixels at any distance
    const dist = camera.position.distanceTo(state.pos);
    const fovRad = ((camera as THREE.PerspectiveCamera).fov ?? 60) * (Math.PI / 180);
    const worldRadius = (VERTEX_SCREEN_HIT_PX * dist * 2 * Math.tan(fovRad / 2)) / size.height;
    m.scale.setScalar(worldRadius);
    // Update ring color based on selection state
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.set(state.isSelected ? C_SELECTED : C_HOVERABLE);
  });

  return (
    <mesh ref={ref} visible={false}>
      <ringGeometry args={[0.72, 1.0, 32]} />
      <meshBasicMaterial
        transparent
        opacity={0.65}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
