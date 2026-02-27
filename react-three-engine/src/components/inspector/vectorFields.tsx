/**
 * inspector/vectorFields.tsx
 *
 * Multi-axis vector field components: Vec2Field, Vec3Field, Vec4Field.
 * Each keeps per-axis draft strings while focused to allow free-typing.
 */
import React, { useEffect, useRef, useState } from "react";
import { numInputStyle } from "../../styles";
import { sectionLabel } from "./styles";

// ─── Vec3Field ───────────────────────────────────────────────────────────────

export function Vec3Field({
  label,
  value,
  onChange,
  step = 0.01,
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  step?: number;
}) {
  const axes = ["X", "Y", "Z"] as const;
  const [drafts, setDrafts] = useState<[string, string, string]>(() =>
    value.map((v) => String(parseFloat(v.toFixed(4)))) as [string, string, string]
  );
  const focused = useRef<number | null>(null);

  useEffect(() => {
    if (focused.current === null) {
      setDrafts(value.map((v) => String(parseFloat(v.toFixed(4)))) as [string, string, string]);
    }
  }, [value]);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ ...sectionLabel, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {axes.map((axis, i) => (
          <label key={axis} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 9, color: "#666", textAlign: "center" }}>{axis}</span>
            <input
              type="number"
              value={drafts[i]}
              step={step}
              onFocus={() => { focused.current = i; }}
              onChange={(e) => {
                const next = [...drafts] as [string, string, string];
                next[i] = e.target.value;
                setDrafts(next);
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) {
                  const nums = [...value] as [number, number, number];
                  nums[i] = parsed;
                  onChange(nums);
                }
              }}
              onBlur={() => {
                focused.current = null;
                const parsed = parseFloat(drafts[i]);
                const committed = isNaN(parsed) ? 0 : parsed;
                const nums = [...value] as [number, number, number];
                nums[i] = committed;
                onChange(nums);
                const next = [...drafts] as [string, string, string];
                next[i] = String(parseFloat(committed.toFixed(4)));
                setDrafts(next);
              }}
              style={numInputStyle}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Vec2Field ───────────────────────────────────────────────────────────────

export function Vec2Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const axes = ["X", "Y"] as const;
  const [drafts, setDrafts] = useState<[string, string]>(() =>
    value.map((v) => String(parseFloat(v.toFixed(4)))) as [string, string]
  );
  const focused = useRef<number | null>(null);

  useEffect(() => {
    if (focused.current === null) {
      setDrafts(value.map((v) => String(parseFloat(v.toFixed(4)))) as [string, string]);
    }
  }, [value]);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ ...sectionLabel, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {axes.map((axis, i) => (
          <label key={axis} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 9, color: "#666", textAlign: "center" }}>{axis}</span>
            <input
              type="number"
              value={drafts[i]}
              step={0.01}
              onFocus={() => { focused.current = i; }}
              onChange={(e) => {
                const next = [...drafts] as [string, string];
                next[i] = e.target.value;
                setDrafts(next);
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) {
                  const nums = [...value] as [number, number];
                  nums[i] = parsed;
                  onChange(nums);
                }
              }}
              onBlur={() => {
                focused.current = null;
                const parsed = parseFloat(drafts[i]);
                const committed = isNaN(parsed) ? 0 : parsed;
                const nums = [...value] as [number, number];
                nums[i] = committed;
                onChange(nums);
                const next = [...drafts] as [string, string];
                next[i] = String(parseFloat(committed.toFixed(4)));
                setDrafts(next);
              }}
              style={numInputStyle}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Vec4Field ───────────────────────────────────────────────────────────────

export function Vec4Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number, number, number];
  onChange: (v: [number, number, number, number]) => void;
}) {
  const axes = ["X", "Y", "Z", "W"] as const;
  const [drafts, setDrafts] = useState<[string, string, string, string]>(() =>
    value.map((v) => String(parseFloat(v.toFixed(4)))) as [string, string, string, string]
  );
  const focused = useRef<number | null>(null);

  useEffect(() => {
    if (focused.current === null) {
      setDrafts(value.map((v) => String(parseFloat(v.toFixed(4)))) as [string, string, string, string]);
    }
  }, [value]);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ ...sectionLabel, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {axes.map((axis, i) => (
          <label key={axis} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 9, color: "#666", textAlign: "center" }}>{axis}</span>
            <input
              type="number"
              value={drafts[i]}
              step={0.001}
              onFocus={() => { focused.current = i; }}
              onChange={(e) => {
                const next = [...drafts] as [string, string, string, string];
                next[i] = e.target.value;
                setDrafts(next);
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) {
                  const nums = [...value] as [number, number, number, number];
                  nums[i] = parsed;
                  onChange(nums);
                }
              }}
              onBlur={() => {
                focused.current = null;
                const parsed = parseFloat(drafts[i]);
                const committed = isNaN(parsed) ? 0 : parsed;
                const nums = [...value] as [number, number, number, number];
                nums[i] = committed;
                onChange(nums);
                const next = [...drafts] as [string, string, string, string];
                next[i] = String(parseFloat(committed.toFixed(4)));
                setDrafts(next);
              }}
              style={numInputStyle}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
