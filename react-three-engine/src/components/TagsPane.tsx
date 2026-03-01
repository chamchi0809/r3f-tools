import React, { useRef, useState } from "react";
import { tagActions, useTagStore, type TagName } from "../store/tagStore";
import { btnStyle, textInputStyle } from "../styles";

export function TagsPane(): React.JSX.Element {
  const tags = useTagStore((s) => s.tags);
  const [newTag, setNewTag] = useState("");
  const [renamingTag, setRenamingTag] = useState<TagName | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const name = newTag.trim();
    if (!name) return;
    tagActions.addTag(name);
    setNewTag("");
  };

  const handleRemove = (tag: TagName) => {
    tagActions.removeTag(tag);
    if (renamingTag === tag) setRenamingTag(null);
  };

  const startRename = (tag: TagName) => {
    setRenamingTag(tag);
    setRenameValue(tag);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const commitRename = () => {
    if (renamingTag) {
      tagActions.renameTag(renamingTag, renameValue);
    }
    setRenamingTag(null);
  };

  const cancelRename = () => {
    setRenamingTag(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
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
          Tags
        </span>
      </div>

      {/* Add new tag */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #2a2a2a",
          display: "flex",
          gap: 6,
        }}
      >
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="New tag name…"
          style={{ ...textInputStyle, flex: 1 }}
        />
        <button onClick={handleAdd} style={btnStyle}>
          Add
        </button>
      </div>

      {/* Tag list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
        {tags.length === 0 && (
          <div
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "#555",
              textAlign: "center",
            }}
          >
            No tags defined.
          </div>
        )}
        {tags.map((tag) => (
          <div
            key={tag}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 4px",
              borderRadius: 4,
              marginBottom: 2,
            }}
          >
            {renamingTag === tag ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") cancelRename();
                }}
                onBlur={commitRename}
                style={{ ...textInputStyle, flex: 1, fontSize: 12 }}
              />
            ) : (
              <>
                {/* Tag chip */}
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: "#ddd",
                    background: "#1e3a2f",
                    border: "1px solid #2a5a40",
                    borderRadius: 3,
                    padding: "3px 8px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: "default",
                  }}
                >
                  # {tag}
                </span>
                <button
                  title="Rename"
                  onClick={() => startRename(tag)}
                  style={{
                    ...btnStyle,
                    padding: "2px 7px",
                    fontSize: 11,
                    opacity: 0.7,
                  }}
                >
                  ✎
                </button>
                <button
                  title="Delete"
                  onClick={() => handleRemove(tag)}
                  style={{
                    ...btnStyle,
                    padding: "2px 7px",
                    fontSize: 11,
                    opacity: 0.7,
                    color: "#e06060",
                  }}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
