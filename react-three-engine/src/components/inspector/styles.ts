/**
 * inspector/styles.ts
 *
 * Shared style constants and the SectionHeader component used across all
 * inspector sub-panels.
 */
import React from "react";
import { textInputStyle } from "../../styles";

// ─── Shared style constants ───────────────────────────────────────────────────

export const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 6,
};

export const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 6,
};

export const labelText: React.CSSProperties = {
  fontSize: 11,
  color: "#aaa",
  width: 90,
  flexShrink: 0,
};

export const selectStyle: React.CSSProperties = {
  ...textInputStyle,
  flex: 1,
  cursor: "pointer",
};

// ─── SectionHeader ───────────────────────────────────────────────────────────

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return React.createElement(
    "div",
    {
      style: {
        fontSize: 11,
        color: "#888",
        textTransform: "uppercase" as const,
        letterSpacing: 1,
        marginBottom: 8,
        marginTop: 14,
        borderBottom: "1px solid #2a2a2a",
        paddingBottom: 4,
      },
    },
    children,
  );
}
