import "react-three-engine";
import * as THREE from "three/webgpu";

declare module "react-three-engine" {
  interface PrefabTypeRegistry {
    "1234": Omit<import("three").Group, "children"> & { children: [THREE.Mesh, THREE.PointLight, THREE.Mesh, THREE.Object3D] };
    "test-prefab": Omit<import("three").Group, "children"> & { children: [THREE.Mesh] };
  }
}
