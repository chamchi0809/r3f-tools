import React, { useCallback, useEffect, useRef } from "react";
import { btnStyle } from "../styles";

export interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "default" | "danger";
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
}: ConfirmModalProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    },
    [onCancel, onConfirm],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const confirmColor = variant === "danger" ? "#c44" : "#3b7dd8";
  const confirmHover = variant === "danger" ? "#d55" : "#4a8fe8";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(2px)",
      }}
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
          onCancel();
        }
      }}
    >
      <div
        ref={panelRef}
        style={{
          background: "#252525",
          border: "1px solid #444",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          padding: "20px 24px",
          minWidth: 320,
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "#eee" }}>{title}</div>
        <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            onClick={onCancel}
            style={{ ...btnStyle, padding: "6px 16px" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#333")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#2a2a2a")}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              ...btnStyle,
              padding: "6px 16px",
              background: confirmColor,
              borderColor: confirmColor,
              color: "#fff",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = confirmHover)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = confirmColor)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
