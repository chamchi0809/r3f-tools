import React from "react";
import { btnStyle } from "../styles";
import {
  useModelingStore,
  modelingActions,
  type EditorMode,
  type SelectionMode,
  type ModelingTransformMode,
  type ModelingTool,
  type BrushType,
} from "../store/modelingStore";

export type TransformMode = "translate" | "rotate" | "scale";


// ─── Editor mode tabs (Object / Modeling / Brush) ──────────────────────────────

const EDITOR_MODES: { mode: EditorMode; label: string }[] = [
  { mode: "object", label: "Object Mode" },
  { mode: "modeling", label: "Modeling Mode" },
  { mode: "brush", label: "Brush Mode" },
];

const SELECTION_MODES: { mode: SelectionMode; label: string; icon: string }[] = [
  { mode: "vertex", label: "Vertex", icon: "●" },
  { mode: "edge", label: "Edge", icon: "╱" },
  { mode: "face", label: "Face", icon: "▣" },
];

const MODELING_TRANSFORM_MODES: { mode: ModelingTransformMode; label: string; hotkey: string }[] = [
  { mode: "translate", label: "Move", hotkey: "G" },
  { mode: "rotate", label: "Rotate", hotkey: "R" },
  { mode: "scale", label: "Scale", hotkey: "S" },
];

const MODELING_TOOLS: { tool: ModelingTool; label: string }[] = [
  { tool: "select", label: "Select" },
  { tool: "add", label: "Add" },
];

const BRUSH_TYPES: { type: BrushType; label: string; disabled?: boolean }[] = [
  { type: "polygon", label: "Polygon Brush" },
  { type: "poly3d", label: "Poly3D Brush" },
  { type: "cube", label: "Cube Brush" },
  { type: "slope", label: "Slope Brush" },
];

// ─── Brush instruction panel ────────────────────────────────────────────────────────

function getInstructionLines(
  brushType: BrushType,
  brushPhase: 1 | 2,
  brushPointCount: number,
): string[] {
  if (brushType === "slope") {
    if (brushPhase === 2) {
      return ["Move mouse up/down to set height", "Click or Enter to confirm · Esc to cancel"];
    }
    if (brushPointCount === 3) {
      return ["Move mouse to pick slope direction (+X / −X / +Z / −Z)", "Click to confirm · Esc to cancel"];
    }
    if (brushPointCount === 1) {
      return ["Move mouse to set rectangle size", "Click to confirm · Esc to cancel"];
    }
    return ["Click to place starting corner"];
  }
  if (brushType === "cube") {
    if (brushPhase === 2) {
      return ["Move mouse up/down to set height", "Click or Enter to confirm · Esc to cancel"];
    }
    if (brushPointCount === 1) {
      return ["Move mouse to set rectangle size", "Click to confirm · Esc to cancel"];
    }
    return ["Click to place starting corner"];
  }
  if (brushPhase === 2) {
    // Poly3D extrude phase
    return ["Move mouse up/down to set height", "Click or Enter to confirm · Esc to cancel"];
  }
  // Phase 1 — polygon drawing (polygon or poly3d)
  if (brushPointCount === 0) {
    return ["Click to place vertices"];
  }
  const lines = ["Click to add vertex"];
  if (brushPointCount >= 3) {
    lines.push("Click first point or Enter to close");
  }
  lines.push("Esc to cancel");
  return lines;
}

function BrushInstructionPanel({
  brushType,
  brushPhase,
  brushPointCount,
}: {
  brushType: BrushType;
  brushPhase: 1 | 2;
  brushPointCount: number;
}) {
  const lines = getInstructionLines(brushType, brushPhase, brushPointCount);
  return (
    <div
      style={{
        background: "#1e1e1ecc",
        border: "1px solid #444",
        borderRadius: 6,
        padding: "5px 10px",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {lines.map((line, i) => (
        <span
          key={i}
          style={{
            fontSize: 12,
            color: i === 0 ? "#ccc" : "#888",
            fontFamily: "monospace",
            whiteSpace: "nowrap",
          }}
        >
          {line}
        </span>
      ))}
    </div>
  );
}
export function EditorModeBar({
  transformMode,
  setTransformMode,
}: {
  transformMode: TransformMode;
  setTransformMode: (m: TransformMode) => void;
}): React.JSX.Element {
  const editorMode = useModelingStore((s) => s.editorMode);
  const selectionMode = useModelingStore((s) => s.selectionMode);
  const modelingTransformMode = useModelingStore((s) => s.transformMode);
  const modelingTool = useModelingStore((s) => s.modelingTool);
  const brushType = useModelingStore((s) => s.brushType);
  const brushPhase = useModelingStore((s) => s.brushPhase);
  const brushPointCount = useModelingStore((s) => s.brushPointCount);
  const isObject = editorMode === "object";
  const isModeling = editorMode === "modeling";
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
              fontSize: 13,
              padding: "3px 10px",
              border: "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Object mode — transform mode (G / R / S) */}
      {isObject && (
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
          {(["translate", "rotate", "scale"] as TransformMode[]).map((m) => {
            const hotkey = m === "translate" ? "G" : m === "rotate" ? "R" : "S";
            return (
              <button
                key={m}
                onClick={() => setTransformMode(m)}
                title={`${m[0].toUpperCase() + m.slice(1)}  [${hotkey}]`}
                style={{
                  ...btnStyle,
                  background: transformMode === m ? "#2d5fa6" : "transparent",
                  color: transformMode === m ? "#fff" : "#888",
                  fontSize: 13,
                  padding: "3px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  border: "none",
                }}
              >
                {m[0].toUpperCase() + m.slice(1)}
                <span style={{ fontSize: 11, opacity: 0.6, fontFamily: "monospace" }}>[{hotkey}]</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Modeling sub-controls */}
      {isModeling && (
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

          {/* Tool (Select / Add) — only in vertex mode */}
          {selectionMode === "vertex" && (
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
              {MODELING_TOOLS.map(({ tool, label }) => (
                <button
                  key={tool}
                  onClick={() => modelingActions.setModelingTool(tool)}
                  title={label}
                  style={{
                    ...btnStyle,
                    background: modelingTool === tool ? "#2d7a5f" : "transparent",
                    color: modelingTool === tool ? "#fff" : "#888",
                    fontSize: 13,
                    padding: "3px 10px",
                    border: "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

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
                  background: modelingTransformMode === mode ? "#7a4a2d" : "transparent",
                  color: modelingTransformMode === mode ? "#fff" : "#888",
                  fontSize: 13,
                  padding: "3px 10px",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {label}
                <span style={{ fontSize: 11, opacity: 0.6, fontFamily: "monospace" }}>
                  [{hotkey}]
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Brush sub-controls */}
      {editorMode === "brush" && (
        <>
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
                  color: disabled ? "#555" : brushType === type ? "#fff" : "#888",
                  fontSize: 13,
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
          {/* Instruction hint panel */}
          <BrushInstructionPanel
            brushType={brushType}
            brushPhase={brushPhase}
            brushPointCount={brushPointCount}
          />
        </>
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
      <span style={{ fontSize: 14, fontWeight: 600, color: "#aaa", marginRight: 8 }}>r3e</span>
      <button onClick={onTogglePrefabs} style={btnStyle}>
        Prefabs
      </button>
    </div>
  );
}
