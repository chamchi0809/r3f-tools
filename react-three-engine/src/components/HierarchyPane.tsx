import React, { useEffect, useRef, useState } from "react";
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

// ─── Context menu styles ─────────────────────────────────────────────────────

const menuStyle: React.CSSProperties = {
  position: "fixed",
  background: "#252525",
  border: "1px solid #444",
  borderRadius: 4,
  zIndex: 1000,
  minWidth: 160,
  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
  padding: "4px 0",
};

const menuItemStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  color: "#ddd",
  display: "flex",
  alignItems: "center",
  gap: 6,
  position: "relative",
};

const menuSeparatorStyle: React.CSSProperties = {
  height: 1,
  background: "#444",
  margin: "4px 0",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  uuid: string | null; // null = right-clicked on empty area
}

// ─── HierarchyNode ───────────────────────────────────────────────────────────

function HierarchyNode({
  node,
  depth,
  selectedUUID,
  nodes,
  renamingUUID,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
}: {
  node: SceneNode;
  depth: number;
  selectedUUID: string | null;
  nodes: Map<string, SceneNode>;
  renamingUUID: string | null;
  onContextMenu: (e: React.MouseEvent, uuid: string) => void;
  onRenameCommit: (uuid: string, name: string) => void;
  onRenameCancel: () => void;
}) {
  const tags = useTagStore((s) => s.objectTags.get(node.uuid));
  const isSelected = node.uuid === selectedUUID;
  const isRenaming = node.uuid === renamingUUID;
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.childUUIDs.length > 0;
  const icon = getIconForKind(node.kind);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  return (
    <div>
      <div
        onClick={(e) => {
          e.stopPropagation();
          sceneActions.select(isSelected ? null : node.uuid);
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onContextMenu(e, node.uuid);
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
        {isRenaming ? (
          <input
            ref={renameInputRef}
            defaultValue={node.name || node.kind}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRenameCommit(node.uuid, (e.target as HTMLInputElement).value);
              } else if (e.key === "Escape") {
                onRenameCancel();
              }
            }}
            onBlur={(e) => onRenameCommit(node.uuid, e.target.value)}
            style={{
              flex: 1,
              background: "#1a1a1a",
              border: "1px solid #555",
              borderRadius: 2,
              color: "#ddd",
              fontSize: 12,
              padding: "1px 4px",
              outline: "none",
              minWidth: 0,
            }}
          />
        ) : (
          <span
            style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {node.name || node.kind}
          </span>
        )}
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
              renamingUUID={renamingUUID}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ) : null;
        })}
    </div>
  );
}

// ─── ContextMenu ─────────────────────────────────────────────────────────────

function MenuItem({
  label,
  icon,
  onClick,
  children,
}: {
  label: string;
  icon?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...menuItemStyle,
        background: hovered ? "#333" : "transparent",
      }}
    >
      {icon && <span style={{ opacity: 0.7, width: 16, textAlign: "center" }}>{icon}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      {children && <span style={{ opacity: 0.5, fontSize: 10 }}>▸</span>}
      {children && hovered && (
        <div
          style={{
            ...menuStyle,
            position: "absolute",
            left: "100%",
            top: 0,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function AddObjectSubmenu({
  parentUUID,
  onDone,
}: {
  parentUUID: string | null;
  onDone: () => void;
}) {
  return (
    <>
      {getAllKinds().map(({ kind, label, icon }) => (
        <MenuItem
          key={kind}
          label={label}
          icon={icon}
          onClick={() => {
            sceneActions.addObject(kind, parentUUID);
            onDone();
          }}
        />
      ))}
    </>
  );
}

function ContextMenu({
  ctx,
  onClose,
  onRename,
}: {
  ctx: ContextMenuState;
  onClose: () => void;
  onRename: (uuid: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (ctx.uuid === null) {
    // Right-clicked on empty area — only show Add Object
    return (
      <div ref={ref} style={{ ...menuStyle, left: ctx.x, top: ctx.y }}>
        <MenuItem label="Add Object" icon="+">
          <AddObjectSubmenu parentUUID={null} onDone={onClose} />
        </MenuItem>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ ...menuStyle, left: ctx.x, top: ctx.y }}>
      <MenuItem
        label="Rename"
        icon="✏"
        onClick={() => {
          onRename(ctx.uuid!);
          onClose();
        }}
      />
      <MenuItem
        label="Duplicate"
        icon="⧉"
        onClick={() => {
          sceneActions.duplicateObject(ctx.uuid!);
          onClose();
        }}
      />
      <MenuItem
        label="Delete"
        icon="🗑"
        onClick={() => {
          sceneActions.removeObject(ctx.uuid!);
          onClose();
        }}
      />
      <div style={menuSeparatorStyle} />
      <MenuItem label="Add Child" icon="+">
        <AddObjectSubmenu parentUUID={ctx.uuid} onDone={onClose} />
      </MenuItem>
    </div>
  );
}

// ─── HierarchyPane ───────────────────────────────────────────────────────────

export function HierarchyPane(): React.JSX.Element {
  const rootUUIDs = useSceneStore((s) => s.rootUUIDs);
  const nodes = useSceneStore((s) => s.nodes);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const editorMode = useModelingStore((s) => s.editorMode);
  const isModeling = editorMode === "modeling";
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingUUID, setRenamingUUID] = useState<string | null>(null);
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

  const handleNodeContextMenu = (e: React.MouseEvent, uuid: string) => {
    if (isModeling) return;
    sceneActions.select(uuid);
    setContextMenu({ x: e.clientX, y: e.clientY, uuid });
    setShowAddMenu(false);
  };

  const handleEmptyContextMenu = (e: React.MouseEvent) => {
    if (isModeling) return;
    e.preventDefault();
    sceneActions.select(null);
    setContextMenu({ x: e.clientX, y: e.clientY, uuid: null });
    setShowAddMenu(false);
  };

  const handleRenameCommit = (uuid: string, name: string) => {
    const trimmed = name.trim();
    if (trimmed) {
      sceneActions.renameObject(uuid, trimmed);
    }
    setRenamingUUID(null);
  };

  const handleRenameCancel = () => {
    setRenamingUUID(null);
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
        onContextMenu={handleEmptyContextMenu}
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
              renamingUUID={renamingUUID}
              onContextMenu={handleNodeContextMenu}
              onRenameCommit={handleRenameCommit}
              onRenameCancel={handleRenameCancel}
            />
          ) : null;
        })}
        {rootUUIDs.length === 0 && (
          <div style={{ padding: "16px 12px", fontSize: 12, color: "#555", textAlign: "center" }}>
            Empty scene. Click + to add.
          </div>
        )}
      </div>
      {contextMenu && !isModeling && (
        <ContextMenu
          ctx={contextMenu}
          onClose={() => setContextMenu(null)}
          onRename={(uuid) => setRenamingUUID(uuid)}
        />
      )}
    </div>
  );
}
