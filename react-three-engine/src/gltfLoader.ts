import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Loads a GLTF or GLB file from a browser File object.
 * Creates a temporary blob URL, loads via GLTFLoader, revokes the URL, and returns the GLTF result.
 */
export function loadGltfFile(file: File): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        URL.revokeObjectURL(url);
        resolve(gltf);
      },
      undefined,
      (error) => {
        URL.revokeObjectURL(url);
        reject(error);
      },
    );
  });
}
