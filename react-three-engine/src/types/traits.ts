import type { BufferGeometry, Material } from 'three';

/**
 * Trait - reusable, composable component
 * Base interface for all trait types
 */
export interface BaseTrait {
  id: string;
  name: string;
}

/**
 * Geometry Trait - defines mesh shape
 * Supports common three.js geometries with configuration
 */
export interface GeometryTrait extends BaseTrait {
  type: 'geometry';
  kind: 'box' | 'sphere' | 'plane' | 'cylinder' | 'cone' | 'torus' | 'custom';
  /**
   * Raw three.js BufferGeometry instance or lazy reference
   * For custom geometries, store the actual BufferGeometry
   */
  geometry: BufferGeometry;
  /** Geometry-specific parameters */
  params?: Record<string, number | string>;
}

/**
 * Material Trait - defines surface appearance
 * Supports common three.js materials
 */
export interface MaterialTrait extends BaseTrait {
  type: 'material';
  kind: 'standard' | 'basic' | 'phong' | 'physical' | 'custom';
  /**
   * Raw three.js Material instance
   * Store the actual Material object for rendering
   */
  material: Material;
  /** Material properties */
  color?: string; // hex or CSS color
  opacity?: number; // 0-1
  metalness?: number; // 0-1 (for standard/physical)
  roughness?: number; // 0-1 (for standard/physical)
  emissive?: string; // hex color
  transparent?: boolean;
  wireframe?: boolean;
}

/**
 * Mesh Trait - combines geometry and material with rendering properties
 * Can be reused across multiple entities via trait references
 */
export interface MeshTrait extends BaseTrait {
  type: 'mesh';
  /** Reference to geometry trait ID */
  geometryId: string;
  /** Reference to material trait ID */
  materialId: string;
  /** Rendering hints */
  castShadow?: boolean;
  receiveShadow?: boolean;
  visible?: boolean;
  /** Additional rendering properties */
  renderOrder?: number;
  frustumCulled?: boolean;
}

/**
 * Union type for all trait types
 */
export type Trait = GeometryTrait | MaterialTrait | MeshTrait;

/**
 * Trait collection - map of traits by ID
 */
export type TraitMap = Record<string, Trait>;
