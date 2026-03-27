import React, { useCallback, useEffect, useRef, useState } from "react";
import { editorConfig } from "virtual:react-three-engine/config";
import { sceneActions } from "../store/sceneActions";
import { useSceneStore } from "../store/sceneStoreState";
import type { SerializedObject } from "../store/sceneTypes";
import { btnStyle, textInputStyle } from "../styles";
import { ConfirmModal } from "./ConfirmModal";

/** Tracks whether the scene has been modified since the last save/load/new. */
function useDirtyFlag() {
  const [dirty, setDirty] = useState(false);
  const ignoreRef = useRef(false);

  // Subscribe to version changes — any bump means user edited the scene.
  // ignoreRef lets us suppress the bumps caused by deserialize.
  const prevVersionRef = useRef(useSceneStore.getState().version);
  useEffect(() => {
    return useSceneStore.subscribe((state) => {
      if (state.version !== prevVersionRef.current) {
        prevVersionRef.current = state.version;
        if (!ignoreRef.current) setDirty(true);
      }
    });
  }, []);

  const markClean = useCallback(() => {
    ignoreRef.current = true;
    setDirty(false);
    // Re-enable tracking after deserialization settles.  We wait for a
    // requestAnimationFrame + microtask so all synchronous version bumps
    // from deserialize() (and the resulting React renders) have landed.
    const raf = requestAnimationFrame(() => {
      prevVersionRef.current = useSceneStore.getState().version;
      ignoreRef.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return { dirty, markClean };
}

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
  const [currentPrefab, setCurrentPrefab] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: "load"; name: string } | { type: "new" } | null>(null);
  const { dirty: hasUnsavedChanges, markClean } = useDirtyFlag();
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
        setCurrentPrefab(name);
        markClean();
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
      markClean();
      sceneActions.deserialize(data);
      setCurrentPrefab(name);
      setSaveName(name);
      setStatus(null);
    } catch {
      setStatus("Load failed");
    }
  };

  const handleNew = () => {
    markClean();
    sceneActions.deserialize([]);
    setCurrentPrefab(null);
    setSaveName("");
    setStatus(null);
  };

  const requestSwitch = (action: { type: "load"; name: string } | { type: "new" }) => {
    if (hasUnsavedChanges && currentPrefab) {
      setPendingAction(action);
    } else if (action.type === "load") {
      handleLoad(action.name);
    } else {
      handleNew();
    }
  };

  const handleConfirmSave = async () => {
    await handleSave();
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action.type === "load") await handleLoad(action.name);
    else handleNew();
  };

  const handleConfirmDiscard = () => {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action.type === "load") handleLoad(action.name);
    else handleNew();
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
          }}
        >
          Prefabs
        </span>
        {currentPrefab && (
          <span
            style={{
              fontSize: 12,
              color: "#7aafff",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 160,
            }}
          >
            {currentPrefab}
          </span>
        )}
        <div style={{ flex: 1 }} />
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
        {/* New Prefab card */}
        <div
          onClick={() => requestSwitch({ type: "new" })}
          style={{
            minWidth: 110,
            maxWidth: 140,
            background: "#1e1e1e",
            border: "1px dashed #444",
            borderRadius: 4,
            padding: "8px 10px",
            fontSize: 13,
            color: "#888",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#262626")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#1e1e1e")}
        >
          <span style={{ fontSize: 22, opacity: 0.5 }}>+</span>
          <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>New Prefab</span>
        </div>

        {prefabs.length === 0 && (
          <div style={{ fontSize: 13, color: "#555", display: "flex", alignItems: "center" }}>
            No saved prefabs
          </div>
        )}
        {prefabs.map((name) => {
          const isActive = name === currentPrefab;
          return (
            <div
              key={name}
              onClick={() => {
                if (!isActive) requestSwitch({ type: "load", name });
              }}
              style={{
                minWidth: 110,
                maxWidth: 140,
                background: isActive ? "#2d5fa6" : "#222",
                border: `1px solid ${isActive ? "#4a80c8" : "#333"}`,
                borderRadius: 4,
                padding: "8px 10px",
                fontSize: 13,
                color: isActive ? "#fff" : "#ccc",
                cursor: isActive ? "default" : "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = "#2a2a2a";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = "#222";
              }}
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
          );
        })}
      </div>

      {pendingAction && (
        <ConfirmModal
          title="Unsaved Changes"
          message={`Save changes to "${currentPrefab}" before ${pendingAction.type === "new" ? "starting a new prefab" : `loading "${pendingAction.name}"`}?`}
          confirmLabel="Save"
          cancelLabel="Don't Save"
          onConfirm={handleConfirmSave}
          onCancel={handleConfirmDiscard}
        />
      )}
    </div>
  );
}
