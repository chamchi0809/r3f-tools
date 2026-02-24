import React from "react";
import { btnStyle } from "../styles";

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
      {(["translate", "rotate", "scale"] as TransformMode[]).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            ...btnStyle,
            background: mode === m ? "#2d5fa6" : "transparent",
            color: mode === m ? "#fff" : "#888",
            fontSize: 11,
            padding: "3px 10px",
          }}
        >
          {m[0].toUpperCase() + m.slice(1)}
        </button>
      ))}
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
