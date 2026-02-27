/**
 * inspector/scalarFields.tsx
 *
 * Scalar form-field components: NumField, IntField, ColorField, CheckField, StringField.
 */
import React, { useEffect, useRef, useState } from "react";
import { numInputStyle, textInputStyle } from "../../styles";
import { rowStyle, labelText } from "./styles";

// ─── NumField ────────────────────────────────────────────────────────────────

/**
 * Number input — keeps local string draft while focused so the user can type
 * freely. External `value` only overwrites when not focused.
 */
export function NumField({
  label,
  value,
  onChange,
  step = 0.01,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(() => String(parseFloat(value.toFixed(4))));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(parseFloat(value.toFixed(4))));
  }, [value]);

  return (
    <div style={rowStyle}>
      <span style={labelText}>{label}</span>
      <input
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        onFocus={() => { focused.current = true; }}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = parseFloat(e.target.value);
          if (!isNaN(parsed)) onChange(parsed);
        }}
        onBlur={() => {
          focused.current = false;
          const parsed = parseFloat(draft);
          const committed = isNaN(parsed) ? 0 : parsed;
          onChange(committed);
          setDraft(String(parseFloat(committed.toFixed(4))));
        }}
        style={{ ...numInputStyle, flex: 1 }}
      />
    </div>
  );
}

// ─── IntField ────────────────────────────────────────────────────────────────

export function IntField({
  label,
  value,
  onChange,
  min = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  return (
    <div style={rowStyle}>
      <span style={labelText}>{label}</span>
      <input
        type="number"
        value={draft}
        step={1}
        min={min}
        onFocus={() => { focused.current = true; }}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = Math.max(min, Math.round(parseFloat(e.target.value) || min));
          onChange(v);
        }}
        onBlur={() => {
          focused.current = false;
          const v = Math.max(min, Math.round(parseFloat(draft) || min));
          onChange(v);
          setDraft(String(v));
        }}
        style={{ ...numInputStyle, flex: 1 }}
      />
    </div>
  );
}

// ─── ColorField ──────────────────────────────────────────────────────────────

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleChange = (newVal: string) => {
    setDraft(newVal);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onChange(newVal);
    }, 80);
  };

  const handleCommit = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      onChange(draft);
    }
  };

  return (
    <div style={rowStyle}>
      <span style={labelText}>{label}</span>
      <input
        type="color"
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleCommit}
        style={{ width: 32, height: 22, border: "none", cursor: "pointer", background: "none", padding: 0, flexShrink: 0 }}
      />
      <span style={{ fontSize: 11, color: "#555", flex: 1 }}>{draft}</span>
    </div>
  );
}

// ─── CheckField ──────────────────────────────────────────────────────────────

export function CheckField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelText}>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ cursor: "pointer" }}
      />
    </div>
  );
}

// ─── StringField ─────────────────────────────────────────────────────────────

export function StringField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return (
    <div style={rowStyle}>
      <span style={labelText}>{label}</span>
      <input
        type="text"
        value={draft}
        onFocus={() => { focused.current = true; }}
        onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }}
        onBlur={() => { focused.current = false; onChange(draft); }}
        style={{ ...textInputStyle, flex: 1 }}
      />
    </div>
  );
}
