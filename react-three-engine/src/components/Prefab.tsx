import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three/webgpu";
import { editorConfig } from "virtual:react-three-engine/config";
import type { GroupProps } from "@react-three/fiber";
import { makeObject } from "../store/sceneStore";
import type { SerializedObject, SerializedMaterial } from "../store/sceneStore";

export interface PrefabProps extends GroupProps {
  id: string;
}

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


export function Prefab({ id, ...groupProps }: PrefabProps): React.ReactElement | null {
  const { apiBase } = editorConfig;
  const [nodes, setNodes] = useState<SerializedObject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNodes(null);
    setError(null);

    fetch(`${apiBase}/load?name=${encodeURIComponent(id)}`)
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
  }, [id, apiBase]);

  const group = useMemo(() => {
    if (!nodes) return null;
    return buildGroup(nodes);
  }, [nodes]);

  if (error) {
    console.warn(`[Prefab] Failed to load prefab "${id}": ${error}`);
    return null;
  }
  if (!group) return null;

  return <primitive object={group} {...groupProps} />;
}
