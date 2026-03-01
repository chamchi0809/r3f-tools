import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { editorConfig } from "virtual:react-three-engine/config";
import type { ThreeElements } from "@react-three/fiber";
import {
  makeObject,
  buildMaterial,
  buildGeometry,
  applySerializedObject,
} from "../store/sceneStore";
import type { SerializedObject } from "../store/sceneStore";
import type { PrefabTypeRegistry, PrefabRef } from "../prefabTypes";

export type PrefabProps<K extends string = string> = Omit<ThreeElements["group"], "id" | "ref"> & {
  id: K;
  ref?: React.Ref<PrefabRef<K>>;
};

function buildSubtree(serialized: SerializedObject): THREE.Object3D {
  const obj = makeObject(serialized.kind);
  obj.name = serialized.name;
  obj.position.set(...serialized.position);
  obj.rotation.set(...serialized.rotation);
  obj.scale.set(...serialized.scale);
  if (obj instanceof THREE.Mesh) {
    if (serialized.geometry) obj.geometry = buildGeometry(serialized.geometry);
    if (serialized.material) obj.material = buildMaterial(serialized.material);
  }
  applySerializedObject(obj, serialized);
  for (const child of serialized.children) {
    obj.add(buildSubtree(child));
  }
  return obj;
}

function buildGroup(nodes: SerializedObject[]): THREE.Group {
  const root = new THREE.Group();
  for (const node of nodes) {
    root.add(buildSubtree(node));
  }
  return root;
}

export function Prefab<K extends keyof PrefabTypeRegistry & string>({
  id,
  ref,
  ...groupProps
}: PrefabProps<K>): React.ReactElement | null;
export function Prefab<K extends string>({ id, ref, ...groupProps }: PrefabProps<K>): React.ReactElement | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Prefab({ id, ref, ...groupProps }: PrefabProps<any>): React.ReactElement | null {
  const { apiBase, prefabUrls } = editorConfig;
  const [nodes, setNodes] = useState<SerializedObject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!ref) return;
    const group = groupRef.current;
    const handle = group
      ? Object.assign(group, {
          find(name: string) {
            return group.getObjectByName(name);
          },
          typedFind(name: string) {
            return group.getObjectByName(name);
          },
        }) as PrefabRef<string>
      : null;
    if (typeof ref === "function") {
      ref(handle);
    } else {
      (ref as React.MutableRefObject<PrefabRef<string> | null>).current = handle;
    }
  });

  useEffect(() => {
    let cancelled = false;
    setNodes(null);
    setError(null);

    const url =
      prefabUrls != null
        ? (prefabUrls[id] ?? null)
        : `${apiBase}/load?name=${encodeURIComponent(id)}`;

    if (!url) {
      setError(`Prefab "${id}" not found`);
      return;
    }

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SerializedObject[]>;
      })
      .then((data) => {
        if (!cancelled) setNodes(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [id, apiBase, prefabUrls]);

  const group = useMemo(() => {
    if (!nodes) return null;
    return buildGroup(nodes);
  }, [nodes]);

  if (error) {
    console.warn(`[Prefab] Failed to load prefab "${id}": ${error}`);
    return null;
  }
  if (!group) return null;

  return <primitive ref={groupRef} object={group} {...groupProps} />;
}
