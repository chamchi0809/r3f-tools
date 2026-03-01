import "react-three-engine";
import * as THREE from "three/webgpu";

declare module "react-three-engine" {
  interface PrefabTypeRegistry {
    "1234": { root: Omit<import("three").Group, "children"> & { children: [Omit<THREE.Group, "children"> & { children: [THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh] }] }; names: "Scene" | "Map" | "door1-1" | "door1-2" | "door2-2" | "door2-1" | "door3-1" | "door3-2" | "door4-1" | "door4-2" | "door5-5" | "door5-2" | "door5-4" | "door5-3"; tags: "door" };
    "test-prefab": { root: Omit<import("three").Group, "children"> & { children: [THREE.Mesh] }; names: "Mesh"; tags: never };
  }
}
