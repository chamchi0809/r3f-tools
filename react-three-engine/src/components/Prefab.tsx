import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { editorConfig } from "virtual:react-three-engine/config";
import type { ThreeElements } from "@react-three/fiber";
import { makeObject } from "../store/sceneStore";
import type { SerializedObject, SerializedMaterial } from "../store/sceneStore";
import type { PrefabTypeRegistry, PrefabRef } from "../prefabTypes";

export type PrefabProps<K extends string = string> = Omit<
  ThreeElements["group"],
  "id" | "ref"
> & {
  id: K;
  ref?: React.Ref<PrefabRef<K>>;
};

function buildMaterial(
  mat: SerializedMaterial,
): THREE.MeshStandardMaterial | THREE.MeshBasicMaterial {
  if (mat.type === "MeshStandardMaterial") {
    const m = new THREE.MeshStandardMaterial();
    m.color.set(mat.color);
    if (mat.roughness !== undefined) m.roughness = mat.roughness;
    if (mat.metalness !== undefined) m.metalness = mat.metalness;
    return m;
  }
  const m = new THREE.MeshBasicMaterial();
  m.color.set(mat.color);
  return m;
}

function buildSubtree(serialized: SerializedObject): THREE.Object3D {
  const obj = makeObject(serialized.kind);
  obj.name = serialized.name;
  obj.position.set(...serialized.position);
  obj.rotation.set(...serialized.rotation);
  obj.scale.set(...serialized.scale);
  if (serialized.material && obj instanceof THREE.Mesh) {
    obj.material = buildMaterial(serialized.material);
  }
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
export function Prefab({
  id,
  ref,
  ...groupProps
}: PrefabProps<string>): React.ReactElement | null;
export function Prefab({
  id,
  ref,
  ...groupProps
}: PrefabProps<string>): React.ReactElement | null {
  const { apiBase, prefabUrls } = editorConfig;
  const [nodes, setNodes] = useState<SerializedObject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (ref) {
      if (typeof ref === "function") {
        ref(groupRef.current as PrefabRef<string>);
      } else {
        (ref as React.MutableRefObject<THREE.Group | null>).current =
          groupRef.current;
      }
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
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
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
