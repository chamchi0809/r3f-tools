import type { SerializedObject } from "../store/sceneTypes";

export interface ScenePrefab {
  id: string;
  name: string;
  nodes: SerializedObject[];
  savedAt: number;
}

class PrefabRegistry {
  private prefabs = new Map<string, ScenePrefab>();

  save(name: string, nodes: SerializedObject[]): ScenePrefab {
    const existing = this.findByName(name);
    const id = existing?.id ?? createId();
    const prefab: ScenePrefab = { id, name, nodes, savedAt: Date.now() };
    this.prefabs.set(id, prefab);
    return prefab;
  }

  get(id: string): ScenePrefab | undefined {
    return this.prefabs.get(id);
  }

  findByName(name: string): ScenePrefab | undefined {
    for (const p of this.prefabs.values()) {
      if (p.name === name) return p;
    }
    return undefined;
  }

  remove(id: string): boolean {
    return this.prefabs.delete(id);
  }

  getAll(): ScenePrefab[] {
    return Array.from(this.prefabs.values()).sort((a, b) => b.savedAt - a.savedAt);
  }

  clear(): void {
    this.prefabs.clear();
  }

  toJSON(): string {
    return JSON.stringify(this.getAll());
  }

  fromJSON(json: string): void {
    const items = JSON.parse(json) as ScenePrefab[];
    this.prefabs.clear();
    for (const item of items) {
      this.prefabs.set(item.id, item);
    }
  }
}

function createId(): string {
  return `prefab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const prefabRegistry: PrefabRegistry = new PrefabRegistry();
