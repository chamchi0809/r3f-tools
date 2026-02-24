import React, { useCallback } from "react";
import * as THREE from "three/webgpu";
import { sceneActions, useSceneStore } from "../store/sceneStore";
import { numInputStyle, textInputStyle } from "../styles";

function Vec3Field({
  label,
  value,
  onChange,
  step = 0.01,
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  step?: number;
}) {
  const axes = ["X", "Y", "Z"] as const;
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          color: "#888",
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {axes.map((axis, i) => (
          <label key={axis} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 9, color: "#666", textAlign: "center" }}>{axis}</span>
            <input
              type="number"
              value={parseFloat(value[i].toFixed(4))}
              step={step}
              onChange={(e) => {
                const next = [...value] as [number, number, number];
                next[i] = parseFloat(e.target.value) || 0;
                onChange(next);
              }}
              style={numInputStyle}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function InspectorPane(): React.JSX.Element {
  const objects = useSceneStore((s) => s.objects);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const version = useSceneStore((s) => s.version);

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
  const scl: [number, number, number] = obj
    ? [obj.scale.x, obj.scale.y, obj.scale.z]
    : [1, 1, 1];

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

  const meshColor = (() => {
    if (!(obj instanceof THREE.Mesh)) return "#888888";
    const mat = obj.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
    return `#${mat.color.getHexString()}`;
  })();

  if (!obj) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "#555", textAlign: "center" }}>
        Select an object to inspect
      </div>
    );
  }

  return (
    <div
      style={{ padding: "12px", overflowY: "auto", height: "100%" }}
      key={`${selectedUUID}-${version}`}
    >
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 11,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 4,
          }}
        >
          Name
        </div>
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

      <div
        style={{
          fontSize: 11,
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 8,
        }}
      >
        Transform
      </div>

      <Vec3Field label="Position" value={pos} onChange={(v) => handleTransform(v, rot, scl)} />
      <Vec3Field label="Rotation" value={rot} step={1} onChange={(v) => handleTransform(pos, v, scl)} />
      <Vec3Field label="Scale" value={scl} onChange={(v) => handleTransform(pos, rot, v)} />

      {obj instanceof THREE.Mesh && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 11,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            Material
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#ccc" }}>
            Color
            <input
              type="color"
              value={meshColor}
              onChange={(e) => sceneActions.setMaterialColor(selectedUUID!, e.target.value)}
              style={{ width: 32, height: 24, border: "none", cursor: "pointer", background: "none", padding: 0 }}
            />
            <span style={{ fontSize: 11, color: "#666" }}>{meshColor}</span>
          </label>
        </div>
      )}
    </div>
  );
}
