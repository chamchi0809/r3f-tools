import "react-three-engine";
import * as THREE from "three/webgpu";

declare module "react-three-engine" {
  interface PrefabTypeRegistry {
    "1234": Omit<import("three").Group, "children"> & { children: [Omit<THREE.Group, "children"> & { children: [THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh] }] };
    "test-prefab": Omit<import("three").Group, "children"> & { children: [THREE.Mesh] };
  }
}
