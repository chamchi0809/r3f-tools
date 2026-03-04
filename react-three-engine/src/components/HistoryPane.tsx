/**
 * HistoryPane.tsx
 *
 * Displays the undo/redo history stack.
 *
 * - Past commands (undoable) are listed top→bottom, most recent at bottom.
 * - The current position is highlighted.
 * - Undone commands (redo stack) appear below the current position, dimmed.
 * - Undo / Redo buttons at the top with keyboard hint.
 * - Clicking "Clear" wipes the stacks (no undo for clear — it's just history).
 */

import React, { useRef, useEffect } from "react";
import { useHistoryStore, historyActions } from "../store/historyStore";
import { btnStyle } from "../styles";

export function HistoryPane(): React.JSX.Element {
  const undoStack = useHistoryStore((s) => s.undoStack);
  const redoStack = useHistoryStore((s) => s.redoStack);
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);

  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when a new action is pushed
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [undoStack.length]);

  const totalCount = undoStack.length + redoStack.length;
  const currentIndex = undoStack.length; // 0-based position after last undone action

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
          flexShrink: 0,
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
          History
        </span>
        <button
          onClick={() => historyActions.undo()}
          disabled={!canUndo}
          title="Undo  [Ctrl+Z]"
          style={{
            ...btnStyle,
            opacity: canUndo ? 1 : 0.3,
            cursor: canUndo ? "pointer" : "not-allowed",
            padding: "3px 8px",
            fontSize: 12,
          }}
        >
          ↩ Undo
        </button>
        <button
          onClick={() => historyActions.redo()}
          disabled={!canRedo}
          title="Redo  [Ctrl+Y]"
          style={{
            ...btnStyle,
            opacity: canRedo ? 1 : 0.3,
            cursor: canRedo ? "pointer" : "not-allowed",
            padding: "3px 8px",
            fontSize: 12,
          }}
        >
          ↪ Redo
        </button>
        {totalCount > 0 && (
          <button
            onClick={() => historyActions.clear()}
            title="Clear history"
            style={{
              ...btnStyle,
              opacity: 0.5,
              padding: "3px 8px",
              fontSize: 11,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Command list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 0",
        }}
      >
        {totalCount === 0 && (
          <div
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "#555",
              textAlign: "center",
            }}
          >
            No actions yet.
          </div>
        )}

        {/* Scene start marker */}
        {totalCount > 0 && (
          <div
            style={{
              padding: "3px 12px",
              fontSize: 11,
              color: "#444",
              fontStyle: "italic",
              userSelect: "none",
            }}
          >
            ─ Scene start ─
          </div>
        )}

        {/* Undo stack entries (past actions) */}
        {undoStack.map((cmd, i) => {
          const isLatest = i === undoStack.length - 1;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                fontSize: 12,
                color: isLatest ? "#e0e0e0" : "#999",
                background: isLatest ? "#1e2d1e" : "transparent",
                borderLeft: isLatest ? "2px solid #4caf50" : "2px solid transparent",
                userSelect: "none",
              }}
            >
              <span style={{ opacity: 0.5, fontSize: 10, flexShrink: 0, width: 26, textAlign: "right" }}>
                {i + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {cmd.label}
              </span>
              {isLatest && (
                <span
                  style={{
                    fontSize: 9,
                    color: "#4caf50",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    flexShrink: 0,
                  }}
                >
                  current
                </span>
              )}
            </div>
          );
        })}

        {/* Current position marker (only when there's a redo stack) */}
        {redoStack.length > 0 && (
          <div
            style={{
              padding: "3px 12px",
              fontSize: 11,
              color: "#3a6a3a",
              fontStyle: "italic",
              userSelect: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ flex: 1, borderTop: "1px dashed #3a4a3a" }} />
            <span>now</span>
            <span style={{ flex: 1, borderTop: "1px dashed #3a4a3a" }} />
          </div>
        )}

        {/* Redo stack entries (undone actions, newest first in the stack so reverse) */}
        {[...redoStack].reverse().map((cmd, i) => {
          const redoIndex = currentIndex + i;
          return (
            <div
              key={`redo-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                fontSize: 12,
                color: "#555",
                background: "transparent",
                borderLeft: "2px solid transparent",
                userSelect: "none",
                fontStyle: "italic",
              }}
            >
              <span style={{ opacity: 0.3, fontSize: 10, flexShrink: 0, width: 26, textAlign: "right" }}>
                {redoIndex + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {cmd.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer: keyboard hint */}
      <div
        style={{
          padding: "6px 12px",
          borderTop: "1px solid #2a2a2a",
          fontSize: 10,
          color: "#444",
          flexShrink: 0,
          fontFamily: "monospace",
          display: "flex",
          gap: 12,
        }}
      >
        <span>Ctrl+Z  undo</span>
        <span>Ctrl+Y  redo</span>
        <span style={{ marginLeft: "auto" }}>
          {undoStack.length}/{undoStack.length + redoStack.length}
        </span>
      </div>
    </div>
  );
}
