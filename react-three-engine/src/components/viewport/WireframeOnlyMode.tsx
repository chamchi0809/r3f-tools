import { useEffect } from "react";
import * as THREE from "three/webgpu";
import { useSceneStore } from "../../store/sceneStoreState";
import { useSettingsStore } from "../../store/settingsStore";

function applyWireframe(wireframe: boolean) {
  const { objects } = useSceneStore.getState();
  objects.forEach((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj instanceof THREE.InstancedMesh) return;
    if (obj.name.startsWith("__")) return;
    const mats = Array.isArray(obj.material)
      ? (obj.material as THREE.Material[])
      : [obj.material as THREE.Material];
    mats.forEach((m) => {
      if (m instanceof THREE.MeshBasicMaterial) return;
      (m as any).wireframe = wireframe;
      m.needsUpdate = true;
    });
  });
}

// Place this component inside the perspective Canvas only.
// It modifies original store mesh materials and calls invalidate() so
// OrthoSceneRenderer automatically syncs clones with the updated material state.
export function WireframeOnlyMode(): null {
  const isWireframe = useSettingsStore((s) => s.wireframe);

  // Apply/restore wireframe on all existing meshes when mode toggles.
  // invalidate() triggers OrthoSceneRenderer to re-sync clone materials.
  useEffect(() => {
    applyWireframe(isWireframe);
    useSceneStore.getState().invalidate();

    return () => {
      if (isWireframe) applyWireframe(false);
    };
  }, [isWireframe]);

  // Apply wireframe to meshes added while mode is active.
  // Uses a store subscription instead of version in deps to avoid invalidate() loops.
  // Skips the first version bump (caused by invalidate() in the toggle effect above).
  useEffect(() => {
    if (!isWireframe) return;
    let skip = true;
    const unsub = useSceneStore.subscribe((state, prevState) => {
      if (state.version !== prevState.version) {
        if (skip) { skip = false; return; }
        applyWireframe(true);
      }
    });
    return unsub;
  }, [isWireframe]);

  return null;
}
