import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A tag name string. */
export type TagName = string;

interface TagState {
  /** Ordered list of all defined tags in the project. */
  tags: TagName[];
  /** Map of object UUID → set of tag names attached to that object. */
  objectTags: Map<string, Set<TagName>>;

  // ─── actions ────────────────────────────────────────────────────────────────

  /** Add a new tag to the global tag list. No-op if tag already exists. */
  addTag: (name: TagName) => void;
  /** Remove a tag from the global list and strip it from all objects. */
  removeTag: (name: TagName) => void;
  /** Rename a tag globally (on the list and all object assignments). */
  renameTag: (oldName: TagName, newName: TagName) => void;

  /** Attach a tag to a specific object UUID. */
  attachTag: (uuid: string, tag: TagName) => void;
  /** Detach a tag from a specific object UUID. */
  detachTag: (uuid: string, tag: TagName) => void;
  /** Replace all tags on an object (used during deserialization). */
  setObjectTags: (uuid: string, tags: TagName[]) => void;
  /** Remove all tag assignments for an object (call on object delete). */
  clearObjectTags: (uuid: string) => void;

  /** Return all objects' UUIDs that have the given tag. */
  findUUIDsWithTag: (tag: TagName) => string[];
}

// ─── Serialization helpers ────────────────────────────────────────────────────

interface PersistedTagState {
  tags: TagName[];
  objectTags: [string, TagName[]][];
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTagStore = create<TagState>()(
  persist(
    (set, get) => ({
      tags: [],
      objectTags: new Map(),

      addTag: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((s) => {
          if (s.tags.includes(trimmed)) return s;
          return { tags: [...s.tags, trimmed] };
        });
      },

      removeTag: (name) => {
        set((s) => {
          const tags = s.tags.filter((t) => t !== name);
          const objectTags = new Map(s.objectTags);
          for (const [uuid, tagSet] of objectTags) {
            if (tagSet.has(name)) {
              const next = new Set(tagSet);
              next.delete(name);
              objectTags.set(uuid, next);
            }
          }
          return { tags, objectTags };
        });
      },

      renameTag: (oldName, newName) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return;
        set((s) => {
          const tags = s.tags.map((t) => (t === oldName ? trimmed : t));
          // Deduplicate in case newName already existed
          const uniqueTags = Array.from(new Set(tags));
          const objectTags = new Map(s.objectTags);
          for (const [uuid, tagSet] of objectTags) {
            if (tagSet.has(oldName)) {
              const next = new Set(tagSet);
              next.delete(oldName);
              next.add(trimmed);
              objectTags.set(uuid, next);
            }
          }
          return { tags: uniqueTags, objectTags };
        });
      },

      attachTag: (uuid, tag) => {
        set((s) => {
          const objectTags = new Map(s.objectTags);
          const current = objectTags.get(uuid) ?? new Set<TagName>();
          if (current.has(tag)) return s;
          objectTags.set(uuid, new Set([...current, tag]));
          return { objectTags };
        });
      },

      detachTag: (uuid, tag) => {
        set((s) => {
          const objectTags = new Map(s.objectTags);
          const current = objectTags.get(uuid);
          if (!current?.has(tag)) return s;
          const next = new Set(current);
          next.delete(tag);
          objectTags.set(uuid, next);
          return { objectTags };
        });
      },

      setObjectTags: (uuid, tags) => {
        set((s) => {
          const objectTags = new Map(s.objectTags);
          objectTags.set(uuid, new Set(tags));
          return { objectTags };
        });
      },

      clearObjectTags: (uuid) => {
        set((s) => {
          if (!s.objectTags.has(uuid)) return s;
          const objectTags = new Map(s.objectTags);
          objectTags.delete(uuid);
          return { objectTags };
        });
      },

      findUUIDsWithTag: (tag) => {
        const { objectTags } = get();
        const result: string[] = [];
        for (const [uuid, tagSet] of objectTags) {
          if (tagSet.has(tag)) result.push(uuid);
        }
        return result;
      },
    }),
    {
      name: "react-three-engine:tags",
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedTagState => ({
        tags: state.tags,
        objectTags: Array.from(state.objectTags.entries()).map(([uuid, tagSet]) => [
          uuid,
          Array.from(tagSet),
        ]),
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<PersistedTagState>;
        return {
          ...current,
          tags: p.tags ?? [],
          objectTags: new Map(
            (p.objectTags ?? []).map(([uuid, tags]) => [uuid, new Set(tags)]),
          ),
        };
      },
    },
  ),
);

// ─── Stable action references ─────────────────────────────────────────────────

export const tagActions = {
  addTag: (name: TagName) => useTagStore.getState().addTag(name),
  removeTag: (name: TagName) => useTagStore.getState().removeTag(name),
  renameTag: (oldName: TagName, newName: TagName) =>
    useTagStore.getState().renameTag(oldName, newName),
  attachTag: (uuid: string, tag: TagName) => useTagStore.getState().attachTag(uuid, tag),
  detachTag: (uuid: string, tag: TagName) => useTagStore.getState().detachTag(uuid, tag),
  setObjectTags: (uuid: string, tags: TagName[]) =>
    useTagStore.getState().setObjectTags(uuid, tags),
  clearObjectTags: (uuid: string) => useTagStore.getState().clearObjectTags(uuid),
  findUUIDsWithTag: (tag: TagName) => useTagStore.getState().findUUIDsWithTag(tag),
};
