import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import {
  sceneActions,
  useSceneStore,
  readGeometryParams,
  readMaterialProps,
  type GeometryType,
  type GeometryParams,
  type MaterialType,
  type SerializedMaterial,
} from "../store/sceneStore";
import { useSettingsStore } from "../store/settingsStore";
import { numInputStyle, textInputStyle } from "../styles";
import {
  introspectObject,
  introspectMaterial,
  introspectGeometry,
  type PropInfo,
  type PropGroup,
  type PropValueType,
} from "./objectInspector";

// ─── shared style helpers ────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 6,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 6,
};

const labelText: React.CSSProperties = {
  fontSize: 11,
  color: "#aaa",
  width: 90,
  flexShrink: 0,
};

const selectStyle: React.CSSProperties = {
  ...textInputStyle,
  flex: 1,
  cursor: "pointer",
};

// ─── sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "#888",
        textTransform: "uppercase" as const,
        letterSpacing: 1,
        marginBottom: 8,
        marginTop: 14,
        borderBottom: "1px solid #2a2a2a",
        paddingBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Number input — keeps local string draft while focused so the user can type
 * freely. External `value` only overwrites when not focused.
 */
function NumField({
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

function IntField({
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

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelText}>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 32, height: 22, border: "none", cursor: "pointer", background: "none", padding: 0, flexShrink: 0 }}
      />
      <span style={{ fontSize: 11, color: "#555", flex: 1 }}>{value}</span>
    </div>
  );
}

function CheckField({
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

function StringField({
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

function Vec3Field({
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

function Vec2Field({
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

function Vec4Field({
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
 *
 * Example:
 *   registerFieldRenderer("color", MyColorPicker);
 *   registerFieldRenderer("MyMaterial.albedo", AlbedoField);
 */
const fieldRegistry = new Map<string, FieldRenderer>();

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

function NestedObjectField({
  label,
  target,
  subGroups,
  onCommit,
  depth = 0,
}: {
  label: string;
  target: object;
  subGroups: PropGroup[];
  onCommit: () => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(true);
  const indent = depth * 10 + 6;

  return (
    <div style={{ marginBottom: 6 }}>
      {/* Header row — acts like a mini section toggle */}
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
                  depth={depth + 1}
                />
              ) : (
                <AutoField
                  key={info.key}
                  className={group.className}
                  info={info}
                  target={target}
                  onCommit={onCommit}
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

interface AutoFieldProps {
  className: string;
  info: PropInfo;
  target: object;
  onCommit: () => void;
}

interface AutoFieldProps {
  className: string;
  info: PropInfo;
  target: object;
  onCommit: () => void;
}

function AutoField({ className, info, target, onCommit }: AutoFieldProps) {
  const { key, valueType } = info;
  const raw = (target as Record<string, unknown>)[key];

  // custom renderer wins
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

  return null;
}

// ─── AutoFieldGroup — collapsible group of auto-generated fields ─────────────

function AutoFieldGroup({
  group,
  target,
  onCommit,
  defaultOpen = true,
  isFieldVisible,
}: {
  group: PropGroup;
  target: object;
  onCommit: () => void;
  defaultOpen?: boolean;
  isFieldVisible?: (className: string, propKey: string) => boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const visibleProps = isFieldVisible
    ? group.props.filter((info) => isFieldVisible(group.className, info.key))
    : group.props;

  // Don't render the group header at all if no visible props
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
        />
      ))}
    </div>
  );
}

// ─── Geometry editor ─────────────────────────────────────────────────────────

const GEOMETRY_TYPES: GeometryType[] = [
  "BoxGeometry",
  "SphereGeometry",
  "CylinderGeometry",
  "ConeGeometry",
  "PlaneGeometry",
  "TorusGeometry",
  "CapsuleGeometry",
];

function GeometryEditor({
  uuid,
  mesh,
  debugMode,
  isFieldVisible,
}: {
  uuid: string;
  mesh: THREE.Mesh;
  debugMode: boolean;
  isFieldVisible: (className: string, propKey: string) => boolean;
}) {
  useSceneStore((s) => s.version);
  const params = readGeometryParams(mesh.geometry);
  const geo = mesh.geometry;

  const setType = (type: GeometryType) => {
    if (type !== params.type) sceneActions.setGeometryType(uuid, type);
  };

  // onCommit for geometry parameter fields: read back the (mutated) parameters
  // and rebuild the geometry, since Three.js geometries are immutable.
  const onCommit = () => {
    const current = readGeometryParams(mesh.geometry);
    sceneActions.setGeometryParams(uuid, current);
  };

  // introspect the geometry for auto fields
  const groups = introspectGeometry(geo, debugMode);

  return (
    <>
      <SectionHeader>Geometry</SectionHeader>
      <div style={rowStyle}>
        <span style={labelText}>Type</span>
        <select value={params.type} onChange={(e) => setType(e.target.value as GeometryType)} style={selectStyle}>
          {GEOMETRY_TYPES.map((t) => <option key={t} value={t}>{t.replace("Geometry", "")}</option>)}
        </select>
      </div>

      {/* Auto-generated geometry fields */}
      {groups.map((group) => (
        <AutoFieldGroup
          key={group.className}
          group={group}
          target={
            group.className === "Parameters"
              ? (geo as unknown as { parameters: object }).parameters
              : geo
          }
          onCommit={onCommit}
          isFieldVisible={isFieldVisible}
        />
      ))}
    </>
  );
}

// ─── Material editor ─────────────────────────────────────────────────────────

const MATERIAL_TYPES: MaterialType[] = [
  "MeshStandardMaterial",
  "MeshPhysicalMaterial",
  "MeshBasicMaterial",
  "MeshToonMaterial",
  "MeshNormalMaterial",
];

const MATERIAL_LABELS: Record<MaterialType, string> = {
  MeshStandardMaterial: "Standard",
  MeshPhysicalMaterial: "Physical",
  MeshBasicMaterial: "Basic",
  MeshToonMaterial: "Toon",
  MeshNormalMaterial: "Normal",
};

function MaterialEditor({
  uuid,
  mesh,
  debugMode,
  isFieldVisible,
}: {
  uuid: string;
  mesh: THREE.Mesh;
  debugMode: boolean;
  isFieldVisible: (className: string, propKey: string) => boolean;
}) {
  useSceneStore((s) => s.version);
  const mat = readMaterialProps(mesh.material as THREE.Material);
  const material = mesh.material as THREE.Material;

  const setType = (type: MaterialType) => {
    if (type !== mat.type) sceneActions.setMaterialType(uuid, type);
  };

  void mat;

  const groups = introspectMaterial(material, debugMode);
  const onCommit = () => sceneActions.invalidate();

  return (
    <>
      <SectionHeader>Material</SectionHeader>
      <div style={rowStyle}>
        <span style={labelText}>Type</span>
        <select value={mat.type} onChange={(e) => setType(e.target.value as MaterialType)} style={selectStyle}>
          {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{MATERIAL_LABELS[t]}</option>)}
        </select>
      </div>

      {/* Auto-generated material fields */}
      {groups.map((group) => (
        <AutoFieldGroup
          key={group.className}
          group={group}
          target={material}
          onCommit={onCommit}
          isFieldVisible={isFieldVisible}
        />
      ))}
    </>
  );
}

// ─── Auto object editor (lights, cameras, groups, etc.) ──────────────────────

function ObjectAutoEditor({
  obj,
  debugMode,
  isFieldVisible,
}: {
  obj: THREE.Object3D;
  debugMode: boolean;
  isFieldVisible: (className: string, propKey: string) => boolean;
}) {
  useSceneStore((s) => s.version);
  const groups = introspectObject(obj, debugMode);
  const onCommit = () => {
    // If this is a camera (or has a shadow camera), call updateProjectionMatrix
    if (obj instanceof THREE.PerspectiveCamera || obj instanceof THREE.OrthographicCamera) {
      obj.updateProjectionMatrix();
    }
    // Also update shadow camera projection matrix if present
    const light = obj as THREE.Light;
    if (light.shadow?.camera) {
      const cam = light.shadow.camera;
      if (cam instanceof THREE.PerspectiveCamera || cam instanceof THREE.OrthographicCamera) {
        (cam as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
    }
    sceneActions.invalidate();
  };

  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((group) => (
        <AutoFieldGroup
          key={group.className}
          group={group}
          target={obj}
          onCommit={onCommit}
          isFieldVisible={isFieldVisible}
        />
      ))}
    </>
  );
}

// ─── Main inspector ───────────────────────────────────────────────────────────

export function InspectorPane(): React.JSX.Element {
  const objects = useSceneStore((s) => s.objects);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const version = useSceneStore((s) => s.version);

  // Settings — subscribe to primitives so re-renders fire when they change
  const debugMode = useSettingsStore((s) => s.debugMode);
  const hiddenFields = useSettingsStore((s) => s.hiddenFields);
  const isFieldVisible = useCallback(
    (className: string, propKey: string) => {
      if (debugMode) return true;
      if (hiddenFields.has(`${className}.${propKey}`)) return false;
      if (hiddenFields.has(propKey)) return false;
      return true;
    },
    [debugMode, hiddenFields],
  );
  const obj = selectedUUID ? (objects.get(selectedUUID) ?? null) : null;

  const pos: [number, number, number] = obj
    ? [obj.position.x, obj.position.y, obj.position.z]
    : [0, 0, 0];
  const rot: [number, number, number] = obj
    ? [
        parseFloat(THREE.MathUtils.radToDeg(obj.rotation.x).toFixed(4)),
        parseFloat(THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(4)),
        parseFloat(THREE.MathUtils.radToDeg(obj.rotation.z).toFixed(4)),
      ]
    : [0, 0, 0];
  const scl: [number, number, number] = obj
    ? [obj.scale.x, obj.scale.y, obj.scale.z]
    : [1, 1, 1];

  const handleTransform = useCallback(
    (
      position: [number, number, number],
      rotDeg: [number, number, number],
      scale: [number, number, number],
    ) => {
      if (!selectedUUID) return;
      const rotRad: [number, number, number] = [
        THREE.MathUtils.degToRad(rotDeg[0]),
        THREE.MathUtils.degToRad(rotDeg[1]),
        THREE.MathUtils.degToRad(rotDeg[2]),
      ];
      sceneActions.setTransform(selectedUUID, position, rotRad, scale);
    },
    [selectedUUID],
  );

  if (!obj) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "#555", textAlign: "center" }}>
        Select an object to inspect
      </div>
    );
  }

  void version;

  const isMesh = obj instanceof THREE.Mesh;
  const isLight = obj instanceof THREE.Light;
  void isLight;

  return (
    <div style={{ padding: "12px", overflowY: "auto", height: "100%" }}>
      {/* Debug mode badge */}
      {debugMode && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            marginBottom: 10,
            background: "#1a2d1a",
            border: "1px solid #2d5a2d",
            borderRadius: 4,
            fontSize: 10,
            color: "#6aef6a",
          }}
        >
          <span style={{ fontSize: 12 }}>⬡</span>
          Debug Mode — all fields visible
        </div>
      )}

      {/* Name */}
      <div style={{ marginBottom: 14 }}>
        <div style={sectionLabel}>Name</div>
        <input
          value={obj.name}
          onChange={(e) => {
            obj.name = e.target.value;
            const state = useSceneStore.getState();
            const node = state.nodes.get(obj.uuid);
            if (node) {
              const nodes = new Map(state.nodes);
              nodes.set(obj.uuid, { ...node, name: e.target.value });
              useSceneStore.setState({ nodes, version: state.version + 1 });
            } else {
              state.invalidate();
            }
          }}
          style={{ ...textInputStyle, width: "100%" }}
        />
      </div>

      {/* Transform */}
      <SectionHeader>Transform</SectionHeader>
      <Vec3Field label="Position" value={pos} onChange={(v) => handleTransform(v, rot, scl)} />
      <Vec3Field label="Rotation" value={rot} step={1} onChange={(v) => handleTransform(pos, v, scl)} />
      <Vec3Field label="Scale"    value={scl} onChange={(v) => handleTransform(pos, rot, v)} />

      {/* Mesh: geometry + material type switchers + auto fields */}
      {isMesh && selectedUUID && (
        <>
          <GeometryEditor
            uuid={selectedUUID}
            mesh={obj}
            debugMode={debugMode}
            isFieldVisible={isFieldVisible}
          />
          <MaterialEditor
            uuid={selectedUUID}
            mesh={obj}
            debugMode={debugMode}
            isFieldVisible={isFieldVisible}
          />
        </>
      )}

      {/* All other auto-generated object properties (lights, cameras, groups, etc.) */}
      <ObjectAutoEditor obj={obj} debugMode={debugMode} isFieldVisible={isFieldVisible} />
    </div>
  );
}

// ─── Built-in enum field renderers ──────────────────────────────────────────

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

// Register built-in enum renderers for known Three.js enum properties
registerFieldRenderer("blending", ({ label, value, onChange }) => (
  <EnumField
    label={label}
    value={value as number}
    onChange={onChange as (v: number) => void}
    options={[
      { label: "No Blending",       value: THREE.NoBlending },
      { label: "Normal",            value: THREE.NormalBlending },
      { label: "Additive",          value: THREE.AdditiveBlending },
      { label: "Subtractive",       value: THREE.SubtractiveBlending },
      { label: "Multiply",          value: THREE.MultiplyBlending },
      { label: "Custom",            value: THREE.CustomBlending },
    ]}
  />
));

registerFieldRenderer("side", ({ label, value, onChange }) => (
  <EnumField
    label={label}
    value={value as number}
    onChange={onChange as (v: number) => void}
    options={[
      { label: "Front",       value: THREE.FrontSide },
      { label: "Back",        value: THREE.BackSide },
      { label: "Double",      value: THREE.DoubleSide },
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
      { label: "Tangent Space",  value: THREE.TangentSpaceNormalMap },
      { label: "Object Space",   value: THREE.ObjectSpaceNormalMap },
    ]}
  />
));

registerFieldRenderer("combine", ({ label, value, onChange }) => (
  <EnumField
    label={label}
    value={value as number}
    onChange={onChange as (v: number) => void}
    options={[
      { label: "Multiply",  value: THREE.MultiplyOperation },
      { label: "Mix",       value: THREE.MixOperation },
      { label: "Add",       value: THREE.AddOperation },
    ]}
  />
));

// Re-export registry for external use
export { registerFieldRenderer as registerInspectorFieldRenderer, fieldRegistry };