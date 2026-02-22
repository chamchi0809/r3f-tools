import type { Vector3, Euler, Quaternion } from 'three';

/**
 * Transform component - shared by all entities
 * Defines position, rotation, and scale in 3D space
 */
export interface Transform {
  position: [x: number, y: number, z: number] | Vector3;
  rotation: [x: number, y: number, z: number] | Euler | Quaternion;
  scale: [x: number, y: number, z: number] | Vector3;
}

/**
 * Base entity interface - all entities must implement this
 */
export interface BaseEntity {
  id: string;
  name: string;
  transform: Transform;
  active: boolean;
  parent?: string; // ID of parent entity for hierarchy
}

/**
 * Group Entity - container for other entities
 * Has no geometry/material, purely hierarchical
 */
export interface GroupEntity extends BaseEntity {
  type: 'group';
  children?: string[]; // IDs of child entities
}

/**
 * Mesh Entity - renderable 3D object
 * Combines geometry, material, and transform
 */
export interface MeshEntity extends BaseEntity {
  type: 'mesh';
  geometry: string; // Reference to geometry trait ID
  material: string; // Reference to material trait ID
  traits?: string[]; // References to additional trait IDs
  castShadow?: boolean;
  receiveShadow?: boolean;
  visible?: boolean;
}

/**
 * Union type for all entity types
 */
export type Entity = GroupEntity | MeshEntity;

/**
 * Entity collection - simple map of entities by ID
 */
export type EntityMap = Record<string, Entity>;
