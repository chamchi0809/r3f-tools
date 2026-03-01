import React, { useState } from "react";
import { tagActions, useTagStore, type TagName } from "../../store/tagStore";
import { btnStyle } from "../../styles";

interface TagEditorProps {
  uuid: string;
}

/** Inline tag editor shown inside the InspectorPane. */
export function TagEditor({ uuid }: TagEditorProps): React.JSX.Element {
  const allTags = useTagStore((s) => s.tags);
  const objectTagSet = useTagStore((s) => s.objectTags.get(uuid));
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const attached = allTags.filter((t) => objectTagSet?.has(t) ?? false);
  const unattached = allTags.filter((t) => !objectTagSet?.has(t));

  const handleAttach = (tag: TagName) => {
    tagActions.attachTag(uuid, tag);
    setDropdownOpen(false);
  };

  const handleDetach = (tag: TagName) => {
    tagActions.detachTag(uuid, tag);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Attached tag chips */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          marginBottom: attached.length > 0 ? 6 : 0,
        }}
      >
        {attached.map((tag) => (
          <span
            key={tag}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "#1e3a2f",
              border: "1px solid #2a5a40",
              borderRadius: 3,
              padding: "2px 7px",
              fontSize: 11,
              color: "#80e0a0",
              cursor: "default",
            }}
          >
            # {tag}
            <button
              title={`Remove tag "${tag}"`}
              onClick={() => handleDetach(tag)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "#80e0a0",
                opacity: 0.7,
                fontSize: 10,
                lineHeight: 1,
                marginLeft: 2,
              }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {/* Add tag dropdown */}
      {allTags.length > 0 && unattached.length > 0 && (
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            style={{ ...btnStyle, fontSize: 11, padding: "3px 8px" }}
          >
            + Add Tag
          </button>
          {dropdownOpen && (
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
                maxHeight: 180,
                overflowY: "auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                marginTop: 2,
              }}
            >
              {unattached.map((tag) => (
                <div
                  key={tag}
                  onClick={() => handleAttach(tag)}
                  style={{
                    padding: "6px 10px",
                    fontSize: 12,
                    color: "#ccc",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "#333")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "transparent")
                  }
                >
                  <span style={{ color: "#2a5a40" }}>#</span> {tag}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {allTags.length === 0 && (
        <div style={{ fontSize: 11, color: "#555" }}>
          No tags defined. Create tags in the Tags pane.
        </div>
      )}

      {allTags.length > 0 && unattached.length === 0 && attached.length > 0 && (
        <div style={{ fontSize: 11, color: "#555" }}>All tags attached.</div>
      )}
    </div>
  );
}
