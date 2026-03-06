/**
 * inspector/MaterialEditor.tsx
 *
 * Material section of the inspector: type switcher + auto-generated property fields.
 */
import React from "react";
import * as THREE from "three/webgpu";
import { readMaterialProps, type MaterialType } from "../../store/serializationCore";
import { sceneActions } from "../../store/sceneActions";
import { useSceneStore } from "../../store/sceneStoreState";
import { introspectMaterial } from "../objectInspector";
import { SectionHeader, rowStyle, labelText, selectStyle } from "./fields";
import { AutoFieldGroup } from "./FieldRegistry";

const MATERIAL_TYPES: MaterialType[] = [
  "MeshStandardMaterial",
  "MeshPhysicalMaterial",
  "MeshBasicMaterial",
  "MeshToonMaterial",
  "MeshNormalMaterial",
];

const MATERIAL_LABELS: Record<MaterialType, string> = {
  MeshStandardMaterial: "Standard",
  MeshPhysicalMaterial: "Physical",
  MeshBasicMaterial: "Basic",
  MeshToonMaterial: "Toon",
  MeshNormalMaterial: "Normal",
};

export function MaterialEditor({
  uuid,
  mesh,
  debugMode,
  isFieldVisible,
}: {
  uuid: string;
  mesh: THREE.Mesh;
  debugMode: boolean;
  isFieldVisible: (className: string, propKey: string) => boolean;
}) {
  useSceneStore((s) => s.version);
  const mat = readMaterialProps(mesh.material as THREE.Material);
  const material = mesh.material as THREE.Material;

  const setType = (type: MaterialType) => {
    if (type !== mat.type) sceneActions.setMaterialType(uuid, type);
  };

  void mat;

  const groups = introspectMaterial(material, debugMode);
  const onCommit = () => sceneActions.invalidate();
  // Texture slot changes need a full material rebuild so WebGPU recompiles
  // the node graph with the new texture binding.
  const onTextureCommit = () => sceneActions.setMaterialProps(uuid, {});

  return (
    <>
      <SectionHeader>Material</SectionHeader>
      <div style={rowStyle}>
        <span style={labelText}>Type</span>
        <select
          value={mat.type}
          onChange={(e) => setType(e.target.value as MaterialType)}
          style={selectStyle}
        >
          {MATERIAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {MATERIAL_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {groups.map((group) => (
        <AutoFieldGroup
          key={group.className}
          group={group}
          target={material}
          onCommit={onCommit}
          onTextureCommit={onTextureCommit}
          isFieldVisible={isFieldVisible}
        />
      ))}
    </>
  );
}
