/**
 * inspector/GeometryEditor.tsx
 *
 * Geometry section of the inspector: type switcher + auto-generated parameter fields.
 */
import React from "react";
import * as THREE from "three/webgpu";
import {
  sceneActions,
  useSceneStore,
  readGeometryParams,
  type GeometryType,
} from "../../store/sceneStore";
import { introspectGeometry } from "../objectInspector";
import { SectionHeader, rowStyle, labelText, selectStyle } from "./fields";
import { AutoFieldGroup } from "./FieldRegistry";

const GEOMETRY_TYPES: GeometryType[] = [
  "BoxGeometry",
  "SphereGeometry",
  "CylinderGeometry",
  "ConeGeometry",
  "PlaneGeometry",
  "TorusGeometry",
  "CapsuleGeometry",
];

export function GeometryEditor({
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
  const params = readGeometryParams(mesh.geometry);
  const geo = mesh.geometry;

  const setType = (type: GeometryType) => {
    if (type !== params.type) sceneActions.setGeometryType(uuid, type);
  };

  const onCommit = () => {
    const current = readGeometryParams(mesh.geometry);
    sceneActions.setGeometryParams(uuid, current);
  };

  const groups = introspectGeometry(geo, debugMode);

  return (
    <>
      <SectionHeader>Geometry</SectionHeader>
      <div style={rowStyle}>
        <span style={labelText}>Type</span>
        <select value={params.type} onChange={(e) => setType(e.target.value as GeometryType)} style={selectStyle}>
          {GEOMETRY_TYPES.map((t) => <option key={t} value={t}>{t.replace("Geometry", "")}</option>)}
        </select>
      </div>

      {groups.map((group) => (
        <AutoFieldGroup
          key={group.className}
          group={group}
          target={
            group.className === "Parameters"
              ? (geo as unknown as { parameters: object }).parameters
              : geo
          }
          onCommit={onCommit}
          isFieldVisible={isFieldVisible}
        />
      ))}
    </>
  );
}
