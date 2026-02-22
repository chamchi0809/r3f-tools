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
  key: string
  data: PrefabData
}

class PrefabRegistry {
  private prefabs: Map<string, PrefabData> = new Map()

  /**
   * Add a new prefab with a unique key
   * @param key - Unique identifier for the prefab
   * @param data - Serializable prefab data
   * @returns true if added, false if key exists
   */
  add(key: string, data: PrefabData): boolean {
    if (this.prefabs.has(key)) {
      return false
    }
    this.prefabs.set(key, data)
    return true
  }

  /**
   * Get a prefab by key
   * @param key - Prefab key
   * @returns Prefab data or undefined if not found
   */
  get(key: string): PrefabData | undefined {
    return this.prefabs.get(key)
  }

  /**
   * Remove a prefab by key
   * @param key - Prefab key to remove
   * @returns true if removed, false if not found
   */
  remove(key: string): boolean {
    return this.prefabs.delete(key)
  }

  /**
   * Check if a key exists
   * @param key - Prefab key
   * @returns true if key exists
   */
  has(key: string): boolean {
    return this.prefabs.has(key)
  }

  /**
   * Get all prefabs
   * @returns Array of all prefabs with keys
   */
  getAll(): Prefab[] {
    return Array.from(this.prefabs.entries()).map(([key, data]) => ({
      key,
      data
    }))
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
