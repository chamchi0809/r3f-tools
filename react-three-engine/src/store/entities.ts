import { create } from 'zustand';
import type { Entity, EntityMap } from '../types';

/**
 * Generate a unique ID for an entity
 * Format: entity_<timestamp>_<random>
 */
export function generateEntityId(): string {
  return `entity_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Entity store state interface
 */
interface EntityStoreState {
  /**
   * Map of all entities by ID
   */
  entities: EntityMap;

  /**
   * Add a new entity to the store
   * If no ID is provided, generates a unique ID
   */
  addEntity: (entity: Entity) => void;

  /**
   * Remove an entity from the store by ID
   */
  removeEntity: (id: string) => void;

  /**
   * Clear all entities from the store
   */
  clearEntities: () => void;

  /**
   * Get entity by ID (selector)
   */
  getEntity: (id: string) => Entity | undefined;

  /**
   * Get all entities as an array (selector)
   */
  getEntities: () => Entity[];

  /**
   * Get entity map (selector)
   */
  getEntityMap: () => EntityMap;
}

/**
 * Entity store - manages entity creation, deletion, and retrieval
 * Uses Zustand for minimal, serializable state management
 */
export const useEntityStore: () => EntityStoreState = create<EntityStoreState>((set, get) => ({
  entities: {},

  addEntity: (entity) =>
    set((state) => ({
      entities: {
        ...state.entities,
        [entity.id]: entity,
      },
    })),

  removeEntity: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.entities;
      return { entities: rest };
    }),

  clearEntities: () => set({ entities: {} }),

  getEntity: (id) => get().entities[id],

  getEntities: () => Object.values(get().entities),

  getEntityMap: () => get().entities,
}));
