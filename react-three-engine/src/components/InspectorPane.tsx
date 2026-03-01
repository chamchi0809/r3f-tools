import React, { useCallback } from "react";
import * as THREE from "three/webgpu";
import { sceneActions, useSceneStore } from "../store/sceneStore";
import { useSettingsStore } from "../store/settingsStore";
import { textInputStyle } from "../styles";
import { sectionLabel, SectionHeader, Vec3Field } from "./inspector/fields";
import {
  fieldRegistry,
  registerFieldRenderer,
  type FieldRenderer,
  type FieldRendererProps,
} from "./inspector/FieldRegistry";
import { GeometryEditor } from "./inspector/GeometryEditor";
import { MaterialEditor } from "./inspector/MaterialEditor";
import { ObjectAutoEditor } from "./inspector/ObjectAutoEditor";
import { TagEditor } from "./inspector/TagEditor";

// ─── Main inspector ───────────────────────────────────────────────────────────

export function InspectorPane(): React.JSX.Element {
  const objects = useSceneStore((s) => s.objects);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const version = useSceneStore((s) => s.version);

  const debugMode = useSettingsStore((s) => s.debugMode);
  const hiddenFields = useSettingsStore((s) => s.hiddenFields);
  const isFieldVisible = useCallback(
    (className: string, propKey: string) => {
      if (debugMode) return true;
      if (hiddenFields.has(`${className}.${propKey}`)) return false;
      if (hiddenFields.has(propKey)) return false;
      return true;
    },
    [debugMode, hiddenFields],
  );
  const obj = selectedUUID ? (objects.get(selectedUUID) ?? null) : null;

  const pos: [number, number, number] = obj
    ? [obj.position.x, obj.position.y, obj.position.z]
    : [0, 0, 0];
  const rot: [number, number, number] = obj
    ? [
        parseFloat(THREE.MathUtils.radToDeg(obj.rotation.x).toFixed(4)),
        parseFloat(THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(4)),
        parseFloat(THREE.MathUtils.radToDeg(obj.rotation.z).toFixed(4)),
      ]
    : [0, 0, 0];
  const scl: [number, number, number] = obj ? [obj.scale.x, obj.scale.y, obj.scale.z] : [1, 1, 1];

  const handleTransform = useCallback(
    (
      position: [number, number, number],
      rotDeg: [number, number, number],
      scale: [number, number, number],
    ) => {
      if (!selectedUUID) return;
      const rotRad: [number, number, number] = [
        THREE.MathUtils.degToRad(rotDeg[0]),
        THREE.MathUtils.degToRad(rotDeg[1]),
        THREE.MathUtils.degToRad(rotDeg[2]),
      ];
      sceneActions.setTransform(selectedUUID, position, rotRad, scale);
    },
    [selectedUUID],
  );

  if (!obj) {
    return (
      <div style={{ padding: 16, fontSize: 13, color: "#555", textAlign: "center" }}>
        Select an object to inspect
      </div>
    );
  }

  void version;

  const isMesh = obj instanceof THREE.Mesh;
  const isLight = obj instanceof THREE.Light;
  void isLight;

  return (
    <div style={{ padding: "12px", overflowY: "auto", height: "100%" }}>
      {/* Debug mode badge */}
      {debugMode && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            marginBottom: 10,
            background: "#1a2d1a",
            border: "1px solid #2d5a2d",
            borderRadius: 4,
            fontSize: 12,
            color: "#6aef6a",
          }}
        >
          <span style={{ fontSize: 13 }}>⬡</span>
          Debug Mode — all fields visible
        </div>
      )}

      {/* Name */}
      <div style={{ marginBottom: 14 }}>
        <div style={sectionLabel}>Name</div>
        <input
          value={obj.name}
          onChange={(e) => {
            obj.name = e.target.value;
            const state = useSceneStore.getState();
            const node = state.nodes.get(obj.uuid);
            if (node) {
              const nodes = new Map(state.nodes);
              nodes.set(obj.uuid, { ...node, name: e.target.value });
              useSceneStore.setState({ nodes, version: state.version + 1 });
            } else {
              state.invalidate();
            }
          }}
          style={{ ...textInputStyle, width: "100%" }}
        />
      </div>

      {/* Transform */}
      <SectionHeader>Transform</SectionHeader>
      <Vec3Field label="Position" value={pos} onChange={(v) => handleTransform(v, rot, scl)} />
      <Vec3Field
        label="Rotation"
        value={rot}
        step={1}
        onChange={(v) => handleTransform(pos, v, scl)}
      />
      <Vec3Field label="Scale" value={scl} onChange={(v) => handleTransform(pos, rot, v)} />

      {/* Tags */}
      {selectedUUID && (
        <>
          <SectionHeader>Tags</SectionHeader>
          <TagEditor uuid={selectedUUID} />
        </>
      )}

      {/* Mesh: geometry + material type switchers + auto fields */}
      {isMesh && selectedUUID && (
        <>
          <GeometryEditor
            uuid={selectedUUID}
            mesh={obj}
            debugMode={debugMode}
            isFieldVisible={isFieldVisible}
          />
          <MaterialEditor
            uuid={selectedUUID}
            mesh={obj}
            debugMode={debugMode}
            isFieldVisible={isFieldVisible}
          />
        </>
      )}

      {/* All other auto-generated object properties (lights, cameras, groups, etc.) */}
      <ObjectAutoEditor obj={obj} debugMode={debugMode} isFieldVisible={isFieldVisible} />
    </div>
  );
}

// Re-export registry for external use
export { registerFieldRenderer as registerInspectorFieldRenderer, fieldRegistry };
export type { FieldRenderer, FieldRendererProps };
