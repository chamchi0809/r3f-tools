import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { sceneActions, useSceneStore } from "../store/sceneStore";

export function ClickSelector({ transformDragging }: { transformDragging: boolean }) {
  const { camera, raycaster, gl } = useThree();
  const pointerDown = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      pointerDown.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (transformDragging) return;
      const down = pointerDown.current;
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      // Ignore if this was a drag (e.g. OrbitControls pan)
      if (Math.sqrt(dx * dx + dy * dy) > 4) return;

      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const { objects } = useSceneStore.getState();
      const meshTargets = Array.from(objects.values()).filter((o) => o instanceof THREE.Mesh);
      const hits = raycaster.intersectObjects(meshTargets, true);
      if (hits.length === 0) {
        sceneActions.select(null);
        return;
      }

      // Walk up from the hit object to find a registered UUID
      let target: THREE.Object3D | null = hits[0].object;
      while (target) {
        if (objects.has(target.uuid)) {
          sceneActions.select(target.uuid);
          return;
        }
        target = target.parent;
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
    };
  }, [camera, raycaster, gl, transformDragging]);

  return null;
}
