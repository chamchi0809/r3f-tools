/**
 * Prefab Registry
 * 
 * Manages prefab storage, retrieval, and key validation.
 * Prefabs are serializable templates for shapes, lights, and models.
 */

export interface PrefabData {
  type: 'shape' | 'light' | 'model'
  shapeType?: 'box' | 'sphere' | 'plane'
  lightType?: 'ambient' | 'directional' | 'point'
  position?: [number, number, number]
  color?: string
  intensity?: number
  url?: string
}

export interface Prefab {
  id: string
  key: string
  data: PrefabData
}

class PrefabRegistry {
  private prefabs: Map<string, Prefab> = new Map()

  /**
   * Add a new prefab with a unique key
   * @param key - Unique display key for the prefab
   * @param data - Serializable prefab data
   * @returns Prefab if added, null if key exists
   */
  add(key: string, data: PrefabData): Prefab | null {
    if (this.hasKey(key)) {
      return null
    }
    const prefab: Prefab = {
      id: createPrefabId(),
      key,
      data
    }
    this.prefabs.set(prefab.id, prefab)
    return prefab
  }

  /**
   * Add a prefab with a pre-defined id (used when loading)
   */
  addWithId(id: string, key: string, data: PrefabData): Prefab | null {
    if (this.prefabs.has(id) || this.hasKey(key)) {
      return null
    }
    const prefab: Prefab = { id, key, data }
    this.prefabs.set(id, prefab)
    return prefab
  }

  /**
   * Get a prefab by id
   * @param id - Prefab id
   * @returns Prefab or undefined if not found
   */
  get(id: string): Prefab | undefined {
    return this.prefabs.get(id)
  }

  /**
   * Get a prefab by key
   */
  getByKey(key: string): Prefab | undefined {
    for (const prefab of this.prefabs.values()) {
      if (prefab.key === key) {
        return prefab
      }
    }
    return undefined
  }

  /**
   * Remove a prefab by id
   * @param id - Prefab id to remove
   * @returns true if removed, false if not found
   */
  remove(id: string): boolean {
    return this.prefabs.delete(id)
  }

  /**
   * Check if a key exists
   * @param key - Prefab key
   * @returns true if key exists
   */
  has(key: string): boolean {
    return this.prefabs.has(key)
  }

  hasKey(key: string): boolean {
    return this.getByKey(key) !== undefined
  }

  /**
   * Get all prefabs
   * @returns Array of all prefabs with ids and keys
   */
  getAll(): Prefab[] {
    return Array.from(this.prefabs.values())
  }

  /**
   * Clear all prefabs
   */
  clear(): void {
    this.prefabs.clear()
  }
}

// Singleton instance
export const prefabRegistry: PrefabRegistry = new PrefabRegistry()

function createPrefabId(): string {
  return `prefab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
