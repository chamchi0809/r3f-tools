import * as THREE from "three/webgpu";

export const VERTEX_RADIUS = 0.04;
export const VERTEX_HIT_RADIUS = 0.12;           // invisible hit sphere — 3× visual for forgiving clicks
export const VERTEX_SCREEN_HIT_PX = 24;          // screen-space hover threshold (pixels)
export const VERTEX_SCREEN_VISUAL_PX = 5;        // target screen-space pixel radius for visual dots
export const VERTEX_COLOR_DEFAULT = "#888888";
export const VERTEX_COLOR_HOVERABLE = "#44aaff"; // within cursor reach but not yet clicked
export const VERTEX_COLOR_SELECTED = "#f0a020";
export const EDGE_COLOR_DEFAULT = "#555555";
export const EDGE_COLOR_SELECTED = "#f0a020";
export const EDGE_HIT_RADIUS = 0.06;
export const FACE_COLOR_DEFAULT = new THREE.Color(0x3399ff).multiplyScalar(0.15);
export const FACE_COLOR_SELECTED = new THREE.Color(0xf0a020).multiplyScalar(0.4);
