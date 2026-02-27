/**
 * inspector/FieldRegistry.tsx
 *
 * Pluggable field renderer registry + the AutoField / AutoFieldGroup /
 * NestedObjectField components that dispatch to registered renderers.
 *
 * Also registers the built-in Three.js enum field renderers (blending, side,
 * depthFunc, normalMapType, combine) at module initialisation time.
 */
import React, { useState } from "react";
import * as THREE from "three/webgpu";
import { NumField, ColorField, CheckField, StringField } from "./scalarFields";
import { Vec2Field, Vec3Field, Vec4Field } from "./vectorFields";
import { TextureField } from "./TextureField";
import { rowStyle, labelText, selectStyle } from "./styles";
import type { PropInfo, PropGroup, PropValueType } from "../objectInspector";

// ─── Field Registry (pluggable custom field renderers) ───────────────────────

export type FieldRendererProps = {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
};

export type FieldRenderer = React.ComponentType<FieldRendererProps>;

/**
 * Registry of custom field renderers keyed by a string type identifier.
 *
 * The key can be:
 * - A PropValueType string: "number", "boolean", "string", "color",
 *   "vector2", "vector3", "vector4", "euler"
 * - A property name: "myCustomProp"
 * - A className.propName: "MyMaterial.customProp"
 *
 * Lookup order: className.propName > propName > valueType
 */
export const fieldRegistry = new Map<string, FieldRenderer>();

export function registerFieldRenderer(key: string, renderer: FieldRenderer): void {
  fieldRegistry.set(key, renderer);
}

function resolveRenderer(
  className: string,
  propKey: string,
  valueType: PropValueType,
): FieldRenderer | null {
  return (
    fieldRegistry.get(`${className}.${propKey}`) ??
    fieldRegistry.get(propKey) ??
    fieldRegistry.get(valueType) ??
    null
  );
}

// ─── NestedObjectField — inline collapsible sub-object ───────────────────────

export function NestedObjectField({
  label,
  target,
  subGroups,
  onCommit,
  onTextureCommit,
  depth = 0,
}: {
  label: string;
  target: object;
  subGroups: PropGroup[];
  onCommit: () => void;
  onTextureCommit?: () => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(true);
  const indent = depth * 10 + 6;

  return (
    <div style={{ marginBottom: 6 }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
          fontSize: 11,
          color: "#999",
          marginBottom: open ? 4 : 2,
          userSelect: "none",
          paddingLeft: indent,
        }}
      >
        <span style={{ fontSize: 9, color: "#555" }}>{open ? "▼" : "▶"}</span>
        <span style={{ fontWeight: 500 }}>{label}</span>
      </div>
      {open && (
        <div style={{ paddingLeft: indent + 8, borderLeft: "1px solid #222" }}>
          {subGroups.map((group) => (
            group.props.map((info) => (
              info.valueType === "object" && info.subGroups ? (
                <NestedObjectField
                  key={info.key}
                  label={info.key}
                  target={(target as Record<string, unknown>)[info.key] as object}
                  subGroups={info.subGroups}
                  onCommit={onCommit}
                  onTextureCommit={onTextureCommit}
                  depth={depth + 1}
                />
              ) : (
                <AutoField
                  key={info.key}
                  className={group.className}
                  info={info}
                  target={target}
                  onCommit={onCommit}
                  onTextureCommit={onTextureCommit}
                />
              )
            ))
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AutoField — renders one property ────────────────────────────────────────

export interface AutoFieldProps {
  className: string;
  info: PropInfo;
  target: object;
  onCommit: () => void;
  /** Called instead of onCommit when a texture slot changes (needs material rebuild). */
  onTextureCommit?: () => void;
}

export function AutoField({ className, info, target, onCommit, onTextureCommit }: AutoFieldProps) {
  const { key, valueType } = info;
  const raw = (target as Record<string, unknown>)[key];

  const Custom = resolveRenderer(className, key, valueType);
  if (Custom) {
    return (
      <Custom
        label={key}
        value={raw}
        onChange={(v) => {
          (target as Record<string, unknown>)[key] = v;
          onCommit();
        }}
      />
    );
  }

  if (valueType === "object" && info.subGroups && raw !== null && raw !== undefined) {
    return (
      <NestedObjectField
        label={key}
        target={raw as object}
        subGroups={info.subGroups}
        onCommit={onCommit}
      />
    );
  }

  if (valueType === "number") {
    return (
      <NumField
        label={key}
        value={raw as number}
        onChange={(v) => {
          (target as Record<string, unknown>)[key] = v;
          onCommit();
        }}
        step={Number.isInteger(raw) ? 1 : 0.01}
      />
    );
  }

  if (valueType === "boolean") {
    return (
      <CheckField
        label={key}
        value={raw as boolean}
        onChange={(v) => {
          (target as Record<string, unknown>)[key] = v;
          onCommit();
        }}
      />
    );
  }

  if (valueType === "string") {
    return (
      <StringField
        label={key}
        value={raw as string}
        onChange={(v) => {
          (target as Record<string, unknown>)[key] = v;
          onCommit();
        }}
      />
    );
  }

  if (valueType === "color") {
    const color = raw as THREE.Color;
    return (
      <ColorField
        label={key}
        value={`#${color.getHexString()}`}
        onChange={(v) => {
          (raw as THREE.Color).set(v);
          onCommit();
        }}
      />
    );
  }

  if (valueType === "vector3") {
    const v3 = raw as THREE.Vector3;
    return (
      <Vec3Field
        label={key}
        value={[v3.x, v3.y, v3.z]}
        onChange={([x, y, z]) => {
          (raw as THREE.Vector3).set(x, y, z);
          onCommit();
        }}
      />
    );
  }

  if (valueType === "vector2") {
    const v2 = raw as THREE.Vector2;
    return (
      <Vec2Field
        label={key}
        value={[v2.x, v2.y]}
        onChange={([x, y]) => {
          (raw as THREE.Vector2).set(x, y);
          onCommit();
        }}
      />
    );
  }

  if (valueType === "vector4") {
    const v4 = raw as THREE.Vector4;
    return (
      <Vec4Field
        label={key}
        value={[v4.x, v4.y, v4.z, v4.w]}
        onChange={([x, y, z, w]) => {
          (raw as THREE.Vector4).set(x, y, z, w);
          onCommit();
        }}
      />
    );
  }

  if (valueType === "euler") {
    const e = raw as THREE.Euler;
    return (
      <Vec3Field
        label={`${key} (deg)`}
        value={[
          THREE.MathUtils.radToDeg(e.x),
          THREE.MathUtils.radToDeg(e.y),
          THREE.MathUtils.radToDeg(e.z),
        ]}
        step={1}
        onChange={([x, y, z]) => {
          (raw as THREE.Euler).set(
            THREE.MathUtils.degToRad(x),
            THREE.MathUtils.degToRad(y),
            THREE.MathUtils.degToRad(z),
          );
          onCommit();
        }}
      />
    );
  }

  if (valueType === "texture") {
    return (
      <TextureField
        label={key}
        value={raw as THREE.Texture | null | undefined}
        onChange={(tex) => {
          (target as Record<string, unknown>)[key] = tex;
          (onTextureCommit ?? onCommit)();
        }}
      />
    );
  }

  return null;
}

// ─── AutoFieldGroup — collapsible group of auto-generated fields ─────────────

export function AutoFieldGroup({
  group,
  target,
  onCommit,
  onTextureCommit,
  defaultOpen = true,
  isFieldVisible,
}: {
  group: PropGroup;
  target: object;
  onCommit: () => void;
  onTextureCommit?: () => void;
  defaultOpen?: boolean;
  isFieldVisible?: (className: string, propKey: string) => boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const visibleProps = isFieldVisible
    ? group.props.filter((info) => isFieldVisible(group.className, info.key))
    : group.props;

  if (visibleProps.length === 0) return null;

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
          fontSize: 11,
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: open ? 8 : 4,
          marginTop: 14,
          borderBottom: "1px solid #2a2a2a",
          paddingBottom: 4,
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 9, color: "#555" }}>{open ? "▼" : "▶"}</span>
        {group.className}
      </div>
      {open && visibleProps.map((info) => (
        <AutoField
          key={info.key}
          className={group.className}
          info={info}
          target={target}
          onCommit={onCommit}
          onTextureCommit={onTextureCommit}
        />
      ))}
    </div>
  );
}

// ─── EnumField (internal helper for built-in renderers) ─────────────────────

function EnumField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  options: Array<{ label: string; value: number }>;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelText}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={selectStyle}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Built-in enum field renderers ───────────────────────────────────────────

registerFieldRenderer("blending", ({ label, value, onChange }) => (
  <EnumField
    label={label}
    value={value as number}
    onChange={onChange as (v: number) => void}
    options={[
      { label: "No Blending",   value: THREE.NoBlending },
      { label: "Normal",        value: THREE.NormalBlending },
      { label: "Additive",      value: THREE.AdditiveBlending },
      { label: "Subtractive",   value: THREE.SubtractiveBlending },
      { label: "Multiply",      value: THREE.MultiplyBlending },
      { label: "Custom",        value: THREE.CustomBlending },
    ]}
  />
));

registerFieldRenderer("side", ({ label, value, onChange }) => (
  <EnumField
    label={label}
    value={value as number}
    onChange={onChange as (v: number) => void}
    options={[
      { label: "Front",  value: THREE.FrontSide },
      { label: "Back",   value: THREE.BackSide },
      { label: "Double", value: THREE.DoubleSide },
    ]}
  />
));

registerFieldRenderer("depthFunc", ({ label, value, onChange }) => (
  <EnumField
    label={label}
    value={value as number}
    onChange={onChange as (v: number) => void}
    options={[
      { label: "Never",         value: THREE.NeverDepth },
      { label: "Always",        value: THREE.AlwaysDepth },
      { label: "Less",          value: THREE.LessDepth },
      { label: "Less Equal",    value: THREE.LessEqualDepth },
      { label: "Equal",         value: THREE.EqualDepth },
      { label: "Greater Equal", value: THREE.GreaterEqualDepth },
      { label: "Greater",       value: THREE.GreaterDepth },
      { label: "Not Equal",     value: THREE.NotEqualDepth },
    ]}
  />
));

registerFieldRenderer("normalMapType", ({ label, value, onChange }) => (
  <EnumField
    label={label}
    value={value as number}
    onChange={onChange as (v: number) => void}
    options={[
      { label: "Tangent Space", value: THREE.TangentSpaceNormalMap },
      { label: "Object Space",  value: THREE.ObjectSpaceNormalMap },
    ]}
  />
));

registerFieldRenderer("combine", ({ label, value, onChange }) => (
  <EnumField
    label={label}
    value={value as number}
    onChange={onChange as (v: number) => void}
    options={[
      { label: "Multiply", value: THREE.MultiplyOperation },
      { label: "Mix",      value: THREE.MixOperation },
      { label: "Add",      value: THREE.AddOperation },
    ]}
  />
));
