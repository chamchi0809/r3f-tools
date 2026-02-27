/**
 * inspector/ObjectAutoEditor.tsx
 *
 * Auto-generated property editor for non-mesh Object3D instances
 * (lights, cameras, groups, etc.).
 */
import React from "react";
import * as THREE from "three/webgpu";
import { sceneActions, useSceneStore } from "../../store/sceneStore";
import { introspectObject } from "../objectInspector";
import { AutoFieldGroup } from "./FieldRegistry";

export function ObjectAutoEditor({
  obj,
  debugMode,
  isFieldVisible,
}: {
  obj: THREE.Object3D;
  debugMode: boolean;
  isFieldVisible: (className: string, propKey: string) => boolean;
}) {
  useSceneStore((s) => s.version);
  const groups = introspectObject(obj, debugMode);

  const onCommit = () => {
    if (obj instanceof THREE.PerspectiveCamera || obj instanceof THREE.OrthographicCamera) {
      obj.updateProjectionMatrix();
    }
    const light = obj as any;
    if (light.shadow?.camera) {
      const cam = (light.shadow as THREE.LightShadow).camera;
      if (cam instanceof THREE.PerspectiveCamera || cam instanceof THREE.OrthographicCamera) {
        (cam as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
    }
    sceneActions.invalidate();
  };

  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((group) => (
        <AutoFieldGroup
          key={group.className}
          group={group}
          target={obj}
          onCommit={onCommit}
          isFieldVisible={isFieldVisible}
        />
      ))}
    </>
  );
}
