import React, { useCallback, useEffect, useState } from "react";
import { editorConfig } from "virtual:react-three-engine/config";
import { sceneActions, type SerializedObject } from "../store/sceneStore";
import { btnStyle, textInputStyle } from "../styles";

export function PrefabPanel({
  onClose,
  onRefresh,
}: {
  onClose: () => void;
  onRefresh: () => void;
}): React.JSX.Element {
  const [prefabs, setPrefabs] = useState<string[]>([]);
  const [saveName, setSaveName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const { apiBase } = editorConfig;

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/list`);
      const data = (await res.json()) as string[];
      setPrefabs(data);
    } catch {
      setStatus("Failed to fetch prefab list");
    }
  }, [apiBase]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleSave = async () => {
    const name = saveName.trim();
    if (!name) {
      setStatus("Enter a name first");
      return;
    }
    const data = sceneActions.serialize();
    try {
      const res = await fetch(`${apiBase}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data }),
      });
      const json = (await res.json()) as { ok?: boolean; file?: string; error?: string };
      if (json.ok) {
        setStatus(`Saved ${json.file}`);
        await fetchList();
        onRefresh();
      } else {
        setStatus(json.error ?? "Save failed");
      }
    } catch {
      setStatus("Save failed");
    }
  };

  const handleLoad = async (name: string) => {
    try {
      const res = await fetch(`${apiBase}/load?name=${encodeURIComponent(name)}`);
      const data = (await res.json()) as SerializedObject[];
      sceneActions.deserialize(data);
      onClose();
    } catch {
      setStatus("Load failed");
    }
  };

  return (
    <div
      style={{
        height: 200,
        borderTop: "1px solid #333",
        background: "#181818",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "6px 12px",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#aaa",
            textTransform: "uppercase",
            letterSpacing: 1,
            flex: 1,
          }}
        >
          Prefabs
        </span>
        <input
          value={saveName}
          onChange={(e) => {
            setSaveName(e.target.value);
            setStatus(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
          placeholder="Prefab name…"
          style={{ ...textInputStyle, width: 160 }}
        />
        <button onClick={handleSave} style={btnStyle}>
          Save
        </button>
        {status && <span style={{ fontSize: 12, color: "#888" }}>{status}</span>}
        <button
          onClick={onClose}
          style={{ ...btnStyle, padding: "2px 8px", fontSize: 12, marginLeft: 4 }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
          display: "flex",
          alignItems: "stretch",
          padding: "8px 12px",
          gap: 8,
        }}
      >
        {prefabs.length === 0 && (
          <div style={{ fontSize: 13, color: "#555", display: "flex", alignItems: "center" }}>
            No saved prefabs
          </div>
        )}
        {prefabs.map((name) => (
          <div
            key={name}
            onClick={() => handleLoad(name)}
            style={{
              minWidth: 110,
              maxWidth: 140,
              background: "#222",
              border: "1px solid #333",
              borderRadius: 4,
              padding: "8px 10px",
              fontSize: 13,
              color: "#ccc",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#2a2a2a")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#222")}
          >
            <span style={{ fontSize: 22, opacity: 0.6 }}>📄</span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                width: "100%",
                textAlign: "center",
                fontSize: 12,
              }}
            >
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
