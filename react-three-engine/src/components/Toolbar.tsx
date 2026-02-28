import React from "react";
import { btnStyle } from "../styles";
import { useModelingStore, modelingActions, type EditorMode, type SelectionMode, type ModelingTransformMode, type BrushType } from "../store/modelingStore";

export type TransformMode = "translate" | "rotate" | "scale";

export function TransformModeBar({
  mode,
  setMode,
}: {
  mode: TransformMode;
  setMode: (m: TransformMode) => void;
}): React.JSX.Element {
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#1e1e1ecc",
        border: "1px solid #444",
        borderRadius: 6,
        display: "flex",
        gap: 2,
        padding: 3,
        backdropFilter: "blur(4px)",
      }}
    >
      {(["translate", "rotate", "scale"] as TransformMode[]).map((m) => {
        const hotkey = m === "translate" ? "G" : m === "rotate" ? "R" : "S";
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            title={`${m[0].toUpperCase() + m.slice(1)}  [${hotkey}]`}
            style={{
              ...btnStyle,
              background: mode === m ? "#2d5fa6" : "transparent",
              color: mode === m ? "#fff" : "#888",
              fontSize: 11,
              padding: "3px 10px",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {m[0].toUpperCase() + m.slice(1)}
            <span style={{ fontSize: 9, opacity: 0.6, fontFamily: "monospace" }}>[{hotkey}]</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Editor mode tabs (Object / Modeling / Brush) ──────────────────────────────

const EDITOR_MODES: { mode: EditorMode; label: string }[] = [
  { mode: "object",   label: "Object Mode" },
  { mode: "modeling", label: "Modeling Mode" },
  { mode: "brush",    label: "Brush Mode" },
];

const SELECTION_MODES: { mode: SelectionMode; label: string; icon: string }[] = [
  { mode: "vertex", label: "Vertex", icon: "●" },
  { mode: "edge",   label: "Edge",   icon: "╱" },
  { mode: "face",   label: "Face",   icon: "▣" },
];

const MODELING_TRANSFORM_MODES: { mode: ModelingTransformMode; label: string; hotkey: string }[] = [
  { mode: "translate", label: "Move",   hotkey: "G" },
  { mode: "rotate",    label: "Rotate", hotkey: "R" },
  { mode: "scale",     label: "Scale",  hotkey: "S" },
];

const BRUSH_TYPES: { type: BrushType; label: string; disabled?: boolean }[] = [
  { type: "polygon", label: "Polygon Brush" },
  { type: "poly3d",  label: "Poly3D Brush" },
  { type: "cube",    label: "Cube Brush",  disabled: true },
  { type: "slope",   label: "Slope Brush", disabled: true },
];

export function EditorModeBar(): React.JSX.Element {
  const editorMode    = useModelingStore((s) => s.editorMode);
  const selectionMode = useModelingStore((s) => s.selectionMode);
  const transformMode = useModelingStore((s) => s.transformMode);
  const brushType     = useModelingStore((s) => s.brushType);

  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        zIndex: 10,
      }}
    >
      {/* Mode tabs */}
      <div
        style={{
          background: "#1e1e1ecc",
          border: "1px solid #444",
          borderRadius: 6,
          display: "flex",
          gap: 2,
          padding: 3,
          backdropFilter: "blur(4px)",
        }}
      >
        {EDITOR_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => modelingActions.setEditorMode(mode)}
            style={{
              ...btnStyle,
              background: editorMode === mode ? "#2d5fa6" : "transparent",
              color: editorMode === mode ? "#fff" : "#888",
              fontSize: 11,
              padding: "3px 10px",
              border: "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Modeling sub-controls */}
      {editorMode === "modeling" && (
        <>
          {/* Selection mode */}
          <div
            style={{
              background: "#1e1e1ecc",
              border: "1px solid #444",
              borderRadius: 6,
              display: "flex",
              gap: 2,
              padding: 3,
              backdropFilter: "blur(4px)",
            }}
          >
            {SELECTION_MODES.map(({ mode, label, icon }) => (
              <button
                key={mode}
                onClick={() => modelingActions.setSelectionMode(mode)}
                title={label}
                style={{
                  ...btnStyle,
                  background: selectionMode === mode ? "#2d7a5f" : "transparent",
                  color: selectionMode === mode ? "#fff" : "#888",
                  fontSize: 13,
                  padding: "3px 10px",
                  border: "none",
                  lineHeight: 1,
                }}
              >
                {icon}
              </button>
            ))}
          </div>

          {/* Transform mode (G / R / S) */}
          <div
            style={{
              background: "#1e1e1ecc",
              border: "1px solid #444",
              borderRadius: 6,
              display: "flex",
              gap: 2,
              padding: 3,
              backdropFilter: "blur(4px)",
            }}
          >
            {MODELING_TRANSFORM_MODES.map(({ mode, label, hotkey }) => (
              <button
                key={mode}
                onClick={() => modelingActions.setTransformMode(mode)}
                title={`${label}  [${hotkey}]`}
                style={{
                  ...btnStyle,
                  background: transformMode === mode ? "#7a4a2d" : "transparent",
                  color: transformMode === mode ? "#fff" : "#888",
                  fontSize: 11,
                  padding: "3px 10px",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {label}
                <span style={{ fontSize: 9, opacity: 0.6, fontFamily: "monospace" }}>[{hotkey}]</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Brush sub-controls */}
      {editorMode === "brush" && (
        <div
          style={{
            background: "#1e1e1ecc",
            border: "1px solid #444",
            borderRadius: 6,
            display: "flex",
            gap: 2,
            padding: 3,
            backdropFilter: "blur(4px)",
          }}
        >
          {BRUSH_TYPES.map(({ type, label, disabled }) => (
            <button
              key={type}
              onClick={() => !disabled && modelingActions.setBrushType(type)}
              disabled={disabled}
              title={disabled ? "Coming soon" : label}
              style={{
                ...btnStyle,
                background: brushType === type ? "#7a2d5f" : "transparent",
                color: disabled ? "#555" : (brushType === type ? "#fff" : "#888"),
                fontSize: 11,
                padding: "3px 10px",
                border: "none",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.4 : 1,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbar({ onTogglePrefabs }: { onTogglePrefabs: () => void }): React.JSX.Element {
  return (
    <div
      style={{
        height: 40,
        background: "#1a1a1a",
        borderBottom: "1px solid #333",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        flexShrink: 0,
        zIndex: 201,
        position: "relative",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: "#aaa", marginRight: 8 }}>r3e</span>
      <button onClick={onTogglePrefabs} style={btnStyle}>Prefabs</button>
    </div>
  );
}
