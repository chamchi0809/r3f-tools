/**
 * react-three-engine
 * 
 * Entry point for the React Three Fiber engine package.
 * Exports core engine functionality and WebGPU support.
 */

import * as THREE from 'three'

// Re-export three module for access to WebGPU and other renderers
export { THREE }

// Package version
export const version = '0.0.1'

// Re-export vitePlugin for convenience
export { reactThreeEnginePlugin } from './vitePlugin'

// Export main App component
export { default as App } from './App'

// Export prefab system
export { Prefab } from './components/Prefab'
export { prefabRegistry, type PrefabData, type Prefab as PrefabType } from './prefabs/registry'
