import { useEffect, useMemo } from "react";
import * as THREE from "three/webgpu";
import { useSceneStore } from "../../store/sceneStoreState";

const WIREFRAME_COLOR = 0x111111;
const WIREFRAME_OPACITY = 0.35;

function attachWireframe(mesh: THREE.Mesh): () => void {
  const wfGeo = new THREE.WireframeGeometry(mesh.geometry);
  const wfMat = new THREE.LineBasicMaterial({
    color: WIREFRAME_COLOR,
    opacity: WIREFRAME_OPACITY,
    transparent: true,
    depthTest: true,
  });
  const lines = new THREE.LineSegments(wfGeo, wfMat);
  lines.name = "__wireframeOverlay";
  lines.raycast = () => {};
  lines.renderOrder = 1;
  mesh.add(lines);

  return () => {
    mesh.remove(lines);
    wfGeo.dispose();
    wfMat.dispose();
  };
}

export function WireframeOverlay(): null {
  const objects = useSceneStore((s) => s.objects);
  const version = useSceneStore((s) => s.version);

  const meshEntries = useMemo(() => {
    const entries: { uuid: string; mesh: THREE.Mesh }[] = [];
    objects.forEach((obj, uuid) => {
      if (obj instanceof THREE.Mesh) entries.push({ uuid, mesh: obj });
    });
    return entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, version]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const { mesh } of meshEntries) {
      cleanups.push(attachWireframe(mesh));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [meshEntries]);

  return null;
}
