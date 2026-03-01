import { useFrame, useThree } from "@react-three/fiber";
import React, { useRef } from "react";
import * as THREE from "three/webgpu";
import { VERTEX_SCREEN_HIT_PX, VERTEX_COLOR_SELECTED, VERTEX_COLOR_HOVERABLE } from "./constants";

/**
 * Camera-facing ring rendered at the hovered vertex's WORLD position (outside
 * the local-space mesh group). Scales each frame so its screen-space radius
 * always matches VERTEX_SCREEN_HIT_PX, giving the user clear visual feedback
 * about how large the selection zone is.
 */
export function VertexHoverGizmo({
  position,
  isSelected,
}: {
  position: THREE.Vector3;
  isSelected: boolean;
}) {
  const { camera, size } = useThree();
  const ref = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    // Billboard: orient ring to always face the camera
    m.quaternion.copy(camera.quaternion);
    // Scale so the ring's radius equals VERTEX_SCREEN_HIT_PX pixels at any distance
    const dist = camera.position.distanceTo(position);
    const fovRad = ((camera as THREE.PerspectiveCamera).fov ?? 60) * (Math.PI / 180);
    const worldRadius = (VERTEX_SCREEN_HIT_PX * dist * 2 * Math.tan(fovRad / 2)) / size.height;
    m.scale.setScalar(worldRadius);
  });

  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[0.72, 1.0, 32]} />
      <meshBasicMaterial
        color={isSelected ? VERTEX_COLOR_SELECTED : VERTEX_COLOR_HOVERABLE}
        transparent
        opacity={0.65}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
