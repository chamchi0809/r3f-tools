import React, { useRef, useState } from "react";
import { sceneActions } from "../store/sceneActions";
import { useSceneStore } from "../store/sceneStoreState";
import type { ObjectKind, SceneNode } from "../store/sceneTypes";
import { useTagStore } from "../store/tagStore";
import { loadGltfFile } from "../gltfLoader";
import { btnStyle } from "../styles";
import { getCustomObjectKinds } from "../customObjectRegistry";
import { useModelingStore } from "../store/modelingStore";

const BUILTIN_KINDS: { kind: ObjectKind; label: string; icon: string }[] = [
  { kind: "mesh", label: "Mesh", icon: "⬛" },
  { kind: "group", label: "Group", icon: "📁" },
  { kind: "ambientLight", label: "Ambient Light", icon: "☀" },
  { kind: "directionalLight", label: "Directional Light", icon: "🔆" },
  { kind: "pointLight", label: "Point Light", icon: "💡" },
  { kind: "perspectiveCamera", label: "Camera", icon: "📷" },
];

function getAllKinds(): { kind: ObjectKind; label: string; icon: string }[] {
  const custom = getCustomObjectKinds().map(({ kind, meta }) => ({
    kind: kind as ObjectKind,
    label: meta.label,
    icon: meta.icon,
  }));
  return [...BUILTIN_KINDS, ...custom];
}

function getIconForKind(kind: ObjectKind): string {
  switch (kind) {
    case "mesh":
      return "⬛";
    case "group":
      return "📁";
    case "ambientLight":
      return "☀";
    case "directionalLight":
      return "🔆";
    case "pointLight":
      return "💡";
    case "perspectiveCamera":
      return "📷";
    default: {
      const custom = getCustomObjectKinds().find((e) => e.kind === kind);
      return custom?.meta.icon ?? "⬜";
    }
  }
}

function HierarchyNode({
  node,
  depth,
  selectedUUID,
  nodes,
}: {
  node: SceneNode;
  depth: number;
  selectedUUID: string | null;
  nodes: Map<string, SceneNode>;
}) {
  const tags = useTagStore((s) => s.objectTags.get(node.uuid));
  const isSelected = node.uuid === selectedUUID;
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.childUUIDs.length > 0;
  const icon = getIconForKind(node.kind);

  return (
    <div>
      <div
        onClick={(e) => {
          e.stopPropagation();
          sceneActions.select(isSelected ? null : node.uuid);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          paddingLeft: 8 + depth * 14,
          paddingTop: 4,
          paddingBottom: 4,
          paddingRight: 8,
          cursor: "pointer",
          background: isSelected ? "#2d5fa6" : "transparent",
          color: isSelected ? "#fff" : "#ccc",
          borderRadius: 3,
          fontSize: 12,
          userSelect: "none",
        }}
      >
        {hasChildren ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            style={{ opacity: 0.5, fontSize: 10, width: 10 }}
          >
            {expanded ? "▾" : "▸"}
          </span>
        ) : (
          <span style={{ width: 10 }} />
        )}
        <span style={{ opacity: 0.6, marginRight: 2 }}>{icon}</span>
        <span
          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {node.name || node.kind}
        </span>
        {tags && tags.size > 0 && (
          <span style={{ display: "flex", gap: 3, flexShrink: 0, marginLeft: 4 }}>
            {Array.from(tags).map((t) => (
              <span
                key={t}
                title={t}
                style={{
                  fontSize: 9,
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: "#1e3a2f",
                  border: "1px solid #2a5a40",
                  color: "#80e0a0",
                  lineHeight: 1.6,
                  maxWidth: 60,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                #{t}
              </span>
            ))}
          </span>
        )}
      </div>
      {expanded &&
        node.childUUIDs.map((childUUID) => {
          const childNode = nodes.get(childUUID);
          return childNode ? (
            <HierarchyNode
              key={childUUID}
              node={childNode}
              depth={depth + 1}
              selectedUUID={selectedUUID}
              nodes={nodes}
            />
          ) : null;
        })}
    </div>
  );
}

export function HierarchyPane(): React.JSX.Element {
  const rootUUIDs = useSceneStore((s) => s.rootUUIDs);
  const nodes = useSceneStore((s) => s.nodes);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const editorMode = useModelingStore((s) => s.editorMode);
  const isModeling = editorMode === "modeling";
  const [showAddMenu, setShowAddMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = (kind: ObjectKind) => {
    if (isModeling) return;
    sceneActions.addObject(kind, selectedUUID);
    setShowAddMenu(false);
  };

  const handleDelete = () => {
    if (isModeling || !selectedUUID) return;
    sceneActions.removeObject(selectedUUID);
  };

  const handleImportGltf = () => {
    if (isModeling) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-imported
    e.target.value = "";
    loadGltfFile(file)
      .then((gltf) => {
        sceneActions.addGltf(gltf.scene);
      })
      .catch((err: unknown) => {
        console.error("[r3e] GLTF import failed:", err);
      });
  };


  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "10px 12px 8px",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#aaa",
            flex: 1,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Hierarchy
        </span>
        {isModeling && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: "#f0a020",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              padding: "2px 5px",
              border: "1px solid #f0a02040",
              borderRadius: 3,
              background: "#f0a01015",
            }}
          >
            Modeling
          </span>
        )}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => !isModeling && setShowAddMenu((v) => !v)}
            style={{
              ...btnStyle,
              opacity: isModeling ? 0.3 : 1,
              cursor: isModeling ? "not-allowed" : "pointer",
            }}
          >
            +
          </button>
          {showAddMenu && !isModeling && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                background: "#252525",
                border: "1px solid #444",
                borderRadius: 4,
                zIndex: 100,
                minWidth: 140,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              {getAllKinds().map(({ kind, label, icon }) => (
                <div
                  key={kind}
                  onClick={() => handleAdd(kind)}
                  style={{
                    padding: "7px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                    color: "#ddd",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.background = "#333")}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.background = "transparent")}
                >
                  <span style={{ opacity: 0.7 }}>{icon}</span>
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleDelete}
          disabled={!selectedUUID || isModeling}
          style={{
            ...btnStyle,
            opacity: selectedUUID && !isModeling ? 1 : 0.3,
            cursor: isModeling ? "not-allowed" : "pointer",
          }}
        >
          🗑
        </button>
        <button
          onClick={handleImportGltf}
          title="Import GLTF / GLB"
          style={{
            ...btnStyle,
            opacity: isModeling ? 0.3 : 1,
            cursor: isModeling ? "not-allowed" : "pointer",
          }}
        >
          Import GLTF
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gltf,.glb"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>
      <div
        style={{ flex: 1, overflowY: "auto", padding: "4px 4px" }}
        onClick={() => sceneActions.select(null)}
      >
        {rootUUIDs.map((uuid) => {
          const node = nodes.get(uuid);
          return node ? (
            <HierarchyNode
              key={uuid}
              node={node}
              depth={0}
              selectedUUID={selectedUUID}
              nodes={nodes}
            />
          ) : null;
        })}
        {rootUUIDs.length === 0 && (
          <div style={{ padding: "16px 12px", fontSize: 12, color: "#555", textAlign: "center" }}>
            Empty scene. Click + to add.
          </div>
        )}
      </div>
    </div>
  );
}
