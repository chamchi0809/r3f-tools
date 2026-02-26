import React, { useMemo } from "react";
import * as THREE from "three/webgpu";
import { useSceneStore } from "../store/sceneStore";
import { useSettingsStore, settingsActions } from "../store/settingsStore";
import {
  introspectObject,
  introspectMaterial,
  introspectGeometry,
  type PropGroup,
} from "./objectInspector";
import { btnStyle } from "../styles";
import { DEFAULT_HIDDEN_FIELDS } from "../constants/defaultHiddenFields";

// ─── Style helpers ────────────────────────────────────────────────────────────

const paneStyle: React.CSSProperties = {
  padding: 12,
  overflowY: "auto",
  height: "100%",
  fontFamily: "inherit",
  fontSize: 12,
  color: "#ccc",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 8,
  marginTop: 14,
  borderBottom: "1px solid #2a2a2a",
  paddingBottom: 4,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 4,
  paddingLeft: 4,
};

const classLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#666",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  marginTop: 10,
  marginBottom: 4,
  paddingLeft: 4,
};

// ─── FieldToggleRow ───────────────────────────────────────────────────────────

function FieldToggleRow({
  className,
  propKey,
  debugMode,
}: {
  className: string;
  propKey: string;
  debugMode: boolean;
}) {
  const qualifiedKey = `${className}.${propKey}`;
  const isHidden = useSettingsStore((s) => s.hiddenFields.has(qualifiedKey));

  return (
    <div style={rowStyle}>
      <input
        type="checkbox"
        id={qualifiedKey}
        checked={!isHidden}
        disabled={debugMode}
        onChange={() => settingsActions.toggleField(qualifiedKey)}
        style={{ cursor: debugMode ? "default" : "pointer", flexShrink: 0 }}
      />
      <label
        htmlFor={qualifiedKey}
        style={{
          fontSize: 11,
          color: debugMode ? "#555" : isHidden ? "#555" : "#bbb",
          cursor: debugMode ? "default" : "pointer",
          flex: 1,
          userSelect: "none",
        }}
      >
        {propKey}
      </label>
    </div>
  );
}

// ─── FieldGroupSection ────────────────────────────────────────────────────────

function FieldGroupSection({
  group,
  debugMode,
}: {
  group: PropGroup;
  debugMode: boolean;
}) {
  const [open, setOpen] = React.useState(true);

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          ...classLabelStyle,
          display: "flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 9, color: "#444" }}>{open ? "▼" : "▶"}</span>
        {group.className}
        <span style={{ color: "#444", fontSize: 10 }}>
          ({group.props.length})
        </span>
      </div>
      {open && (
        <div style={{ paddingLeft: 8, borderLeft: "1px solid #1e1e1e" }}>
          {group.props.map((info) => (
            <FieldToggleRow
              key={info.key}
              className={group.className}
              propKey={info.key}
              debugMode={debugMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SettingsPane ─────────────────────────────────────────────────────────────

export function SettingsPane(): React.JSX.Element {
  const objects = useSceneStore((s) => s.objects);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const version = useSceneStore((s) => s.version);
  void version;

  const debugMode = useSettingsStore((s) => s.debugMode);
  const hiddenCount = useSettingsStore((s) => s.hiddenFields.size);
  const hiddenFields = useSettingsStore((s) => s.hiddenFields);

  // Show reset button when current state differs from defaults.
  const isAtDefaults = useMemo(() => {
    if (hiddenFields.size !== DEFAULT_HIDDEN_FIELDS.length) return false;
    return DEFAULT_HIDDEN_FIELDS.every((k) => hiddenFields.has(k));
  }, [hiddenFields]);

  const obj = selectedUUID ? (objects.get(selectedUUID) ?? null) : null;

  // Introspect selected object using the same filter as the inspector (debug=false).
  // The field list here should mirror exactly what the inspector shows, so users
  // can toggle only the fields they actually see.
  const allGroups = useMemo((): PropGroup[] => {
    if (!obj) return [];
    const groups: PropGroup[] = [];
    const isMesh = obj instanceof THREE.Mesh;

    if (isMesh) {
      groups.push(...introspectGeometry(obj.geometry, false));
      groups.push(...introspectMaterial(obj.material as THREE.Material, false));
    }

    groups.push(...introspectObject(obj, false));

    return groups;
  }, [obj]);

  return (
    <div style={paneStyle}>
      {/* ── Debug mode toggle ───────────────────────────────────────────── */}
      <div style={sectionLabel}>Inspector Settings</div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 4px",
          background: debugMode ? "#1a2d1a" : "#1e1e1e",
          border: `1px solid ${debugMode ? "#2d5a2d" : "#333"}`,
          borderRadius: 6,
          marginBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: debugMode ? "#6aef6a" : "#ccc",
              fontWeight: 600,
            }}
          >
            Debug Mode
          </div>
          <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
            {debugMode
              ? "All fields shown — hiding disabled"
              : "Show all properties including internal ones"}
          </div>
        </div>
        <button
          onClick={settingsActions.toggleDebugMode}
          style={{
            ...btnStyle,
            background: debugMode ? "#2d5a2d" : "#2a2a2a",
            color: debugMode ? "#6aef6a" : "#888",
            border: `1px solid ${debugMode ? "#3d7a3d" : "#444"}`,
            fontWeight: 600,
            minWidth: 48,
          }}
        >
          {debugMode ? "ON" : "OFF"}
        </button>
      </div>

      {/* ── Field visibility ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <div style={{ ...sectionLabel, marginTop: 0, marginBottom: 0 }}>
          Field Visibility
          {hiddenCount > 0 && !debugMode && (
            <span style={{ color: "#a06020", marginLeft: 6 }}>
              ({hiddenCount} hidden)
            </span>
          )}
        </div>
        {!isAtDefaults && (
          <button
            onClick={settingsActions.resetHiddenFields}
            style={{
              ...btnStyle,
              fontSize: 10,
              padding: "2px 8px",
              color: "#888",
            }}
          >
            Reset to defaults
          </button>
        )}
      </div>

      {!obj && (
        <div
          style={{
            padding: "20px 4px",
            fontSize: 11,
            color: "#555",
            textAlign: "center",
          }}
        >
          Select an object to configure its field visibility
        </div>
      )}

      {obj && allGroups.length === 0 && (
        <div
          style={{
            padding: "20px 4px",
            fontSize: 11,
            color: "#555",
            textAlign: "center",
          }}
        >
          No configurable fields
        </div>
      )}

      {obj && allGroups.length > 0 && (
        <div>
          {allGroups.map((group) => (
            <FieldGroupSection
              key={group.className}
              group={group}
              debugMode={debugMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
