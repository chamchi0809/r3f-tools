import { OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { editorConfig } from "virtual:react-three-engine/config";
import {
  makeObject,
  sceneActions,
  useSceneStore,
  type ObjectKind,
  type SceneNode,
  type SerializedObject,
} from "./store/sceneStore";

type TransformMode = "translate" | "rotate" | "scale";

const OBJECT_KINDS: { kind: ObjectKind; label: string }[] = [
  { kind: "mesh", label: "Mesh" },
  { kind: "group", label: "Group" },
  { kind: "ambientLight", label: "Ambient Light" },
  { kind: "directionalLight", label: "Directional Light" },
  { kind: "pointLight", label: "Point Light" },
  { kind: "perspectiveCamera", label: "Camera" },
];

function makeDeserializedObject(node: SerializedObject): THREE.Object3D {
  const obj = makeObject(node.kind);
  obj.name = node.name;
  obj.position.set(...node.position);
  obj.rotation.set(...node.rotation);
  obj.scale.set(...node.scale);
  if (node.material && obj instanceof THREE.Mesh) {
    const mat =
      node.material.type === "MeshStandardMaterial"
        ? new THREE.MeshStandardMaterial()
        : new THREE.MeshBasicMaterial();
    mat.color.set(node.material.color);
    if (mat instanceof THREE.MeshStandardMaterial) {
      if (node.material.roughness !== undefined)
        mat.roughness = node.material.roughness;
      if (node.material.metalness !== undefined)
        mat.metalness = node.material.metalness;
    }
    obj.material = mat;
  }
  return obj;
}

function addDeserializedSubtree(
  scene: THREE.Scene,
  serialized: SerializedObject,
  parentObj: THREE.Object3D | THREE.Scene,
  parentUUID: string | null,
): void {
  const obj = makeDeserializedObject(serialized);
  parentObj.add(obj);
  useSceneStore.getState().registerObject(obj, serialized.kind, parentUUID);
  for (const child of serialized.children) {
    addDeserializedSubtree(scene, child, obj, obj.uuid);
  }
}

function SceneContent({
  onTransformDrag,
  transformMode,
}: {
  onTransformDrag: (dragging: boolean) => void;
  transformMode: TransformMode;
}) {
  const { scene } = useThree();
  const pendingAdd = useSceneStore((s) => s.pendingAdd);
  const pendingRemove = useSceneStore((s) => s.pendingRemove);
  const pendingDeserialize = useSceneStore((s) => s.pendingDeserialize);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);

  useFrame(() => {});
  useFrame(() => {});

  useEffect(() => {
    if (!pendingAdd) return;
    useSceneStore.getState().clearPendingAdd();
    const { kind, parentUUID } = pendingAdd;
    const obj = makeObject(kind);
    const parent = parentUUID
      ? (useSceneStore.getState().objects.get(parentUUID) ?? scene)
      : scene;
    parent.add(obj);
    useSceneStore.getState().registerObject(obj, kind, parentUUID);
  }, [pendingAdd, scene]);

  useEffect(() => {
    if (!pendingRemove) return;
    useSceneStore.getState().clearPendingRemove();

    const removeRecursive = (uuid: string) => {
      const state = useSceneStore.getState();
      const node = state.nodes.get(uuid);
      const obj = state.objects.get(uuid);
      if (node) {
        for (const childUUID of [...node.childUUIDs]) {
          removeRecursive(childUUID);
        }
      }
      if (obj) {
        obj.parent?.remove(obj);
      }
      state.unregisterObject(uuid);
    };

    removeRecursive(pendingRemove);
  }, [pendingRemove]);

  useEffect(() => {
    if (!pendingDeserialize) return;
    useSceneStore.getState().clearPendingDeserialize();

    const state = useSceneStore.getState();
    for (const uuid of [...state.rootUUIDs]) {
      const obj = state.objects.get(uuid);
      if (obj) scene.remove(obj);
    }
    useSceneStore.setState({
      rootUUIDs: [],
      nodes: new Map(),
      objects: new Map(),
      selectedUUID: null,
    });

    for (const serialized of pendingDeserialize) {
      addDeserializedSubtree(scene, serialized, scene, null);
    }
  }, [pendingDeserialize, scene]);

  const selectedObj = selectedUUID
    ? (useSceneStore.getState().objects.get(selectedUUID) ?? null)
    : null;

  return (
    <>
      {selectedObj && (
        <TransformControls
          object={selectedObj}
          mode={transformMode}
          onMouseDown={() => onTransformDrag(true)}
          onMouseUp={() => {
            onTransformDrag(false);
            useSceneStore.getState().invalidate();
          }}
        />
      )}
    </>
  );
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
  }
}

function HierarchyNode({
  node,
  depth,
  selectedUUID,
  nodes,
}: {
  node: SceneNode;
  depth: number;
  selectedUUID: string | null;
  nodes: Map<string, SceneNode>;
}) {
  const isSelected = node.uuid === selectedUUID;
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.childUUIDs.length > 0;
  const icon = getIconForKind(node.kind);

  return (
    <div>
      <div
        onClick={() => sceneActions.select(isSelected ? null : node.uuid)}
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
        {hasChildren && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            style={{ opacity: 0.5, fontSize: 10, width: 10 }}
          >
            {expanded ? "▾" : "▸"}
          </span>
        )}
        {!hasChildren && <span style={{ width: 10 }} />}
        <span style={{ opacity: 0.6, marginRight: 2 }}>{icon}</span>
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.name || node.kind}
        </span>
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
            />
          ) : null;
        })}
    </div>
  );
}

function HierarchyPane() {
  const rootUUIDs = useSceneStore((s) => s.rootUUIDs);
  const nodes = useSceneStore((s) => s.nodes);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const handleAdd = (kind: ObjectKind) => {
    sceneActions.addObject(kind, selectedUUID);
    setShowAddMenu(false);
  };

  const handleDelete = () => {
    if (selectedUUID) sceneActions.removeObject(selectedUUID);
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
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowAddMenu((v) => !v)} style={btnStyle}>
            +
          </button>
          {showAddMenu && (
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
              {OBJECT_KINDS.map(({ kind, label }) => (
                <div
                  key={kind}
                  onClick={() => handleAdd(kind)}
                  style={{
                    padding: "7px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                    color: "#ddd",
                  }}
                  onMouseEnter={(e) =>
                    ((e.target as HTMLElement).style.background = "#333")
                  }
                  onMouseLeave={(e) =>
                    ((e.target as HTMLElement).style.background = "transparent")
                  }
                >
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleDelete}
          disabled={!selectedUUID}
          style={{ ...btnStyle, opacity: selectedUUID ? 1 : 0.3 }}
        >
          🗑
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 4px" }}>
        {rootUUIDs.map((uuid) => {
          const node = nodes.get(uuid);
          return node ? (
            <HierarchyNode
              key={uuid}
              node={node}
              depth={0}
              selectedUUID={selectedUUID}
              nodes={nodes}
            />
          ) : null;
        })}
        {rootUUIDs.length === 0 && (
          <div
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "#555",
              textAlign: "center",
            }}
          >
            Empty scene. Click + to add.
          </div>
        )}
      </div>
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
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          color: "#888",
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {axes.map((axis, i) => (
          <label
            key={axis}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 9, color: "#666", textAlign: "center" }}>
              {axis}
            </span>
            <input
              type="number"
              value={parseFloat(value[i].toFixed(4))}
              step={step}
              onChange={(e) => {
                const next = [...value] as [number, number, number];
                next[i] = parseFloat(e.target.value) || 0;
                onChange(next);
              }}
              style={numInputStyle}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function InspectorPane() {
  const objects = useSceneStore((s) => s.objects);
  const selectedUUID = useSceneStore((s) => s.selectedUUID);
  const version = useSceneStore((s) => s.version);

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

  const meshColor = (() => {
    if (!(obj instanceof THREE.Mesh)) return "#888888";
    const mat = obj.material as
      | THREE.MeshStandardMaterial
      | THREE.MeshBasicMaterial;
    return `#${mat.color.getHexString()}`;
  })();

  if (!obj) {
    return (
      <div
        style={{
          padding: 16,
          fontSize: 12,
          color: "#555",
          textAlign: "center",
        }}
      >
        Select an object to inspect
      </div>
    );
  }

  return (
    <div
      style={{ padding: "12px", overflowY: "auto", height: "100%" }}
      key={`${selectedUUID}-${version}`}
    >
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 11,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 4,
          }}
        >
          Name
        </div>
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

      <div
        style={{
          fontSize: 11,
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 8,
        }}
      >
        Transform
      </div>

      <Vec3Field
        label="Position"
        value={pos}
        onChange={(v) => handleTransform(v, rot, scl)}
      />
      <Vec3Field
        label="Rotation"
        value={rot}
        step={1}
        onChange={(v) => handleTransform(pos, v, scl)}
      />
      <Vec3Field
        label="Scale"
        value={scl}
        onChange={(v) => handleTransform(pos, rot, v)}
      />

      {obj instanceof THREE.Mesh && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 11,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            Material
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "#ccc",
            }}
          >
            Color
            <input
              type="color"
              value={meshColor}
              onChange={(e) =>
                sceneActions.setMaterialColor(selectedUUID!, e.target.value)
              }
              style={{
                width: 32,
                height: 24,
                border: "none",
                cursor: "pointer",
                background: "none",
                padding: 0,
              }}
            />
            <span style={{ fontSize: 11, color: "#666" }}>{meshColor}</span>
          </label>
        </div>
      )}
    </div>
  );
}

function TransformModeBar({
  mode,
  setMode,
}: {
  mode: TransformMode;
  setMode: (m: TransformMode) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#1e1e1ecc",
        border: "1px solid #444",
        borderRadius: 6,
        display: "flex",
        gap: 2,
        padding: 3,
        backdropFilter: "blur(4px)",
      }}
    >
      {(["translate", "rotate", "scale"] as TransformMode[]).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            ...btnStyle,
            background: mode === m ? "#2d5fa6" : "transparent",
            color: mode === m ? "#fff" : "#888",
            fontSize: 11,
            padding: "3px 10px",
          }}
        >
          {m[0].toUpperCase() + m.slice(1)}
        </button>
      ))}
    </div>
  );
}

function PrefabPanel({
  onClose,
  onRefresh,
}: {
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [prefabs, setPrefabs] = useState<string[]>([]);
  const [saveName, setSaveName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const { apiBase } = editorConfig;
  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/list`);
      const data = (await res.json()) as string[];
      setPrefabs(data);
    } catch {
      setStatus("Failed to fetch prefab list");
    }
  }, [apiBase]);
  useEffect(() => {
    fetchList();
  }, [fetchList]);
  const handleSave = async () => {
    const name = saveName.trim();
    if (!name) {
      setStatus("Enter a name first");
      return;
    }
    const data = sceneActions.serialize();
    try {
      const res = await fetch(`${apiBase}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        file?: string;
        error?: string;
      };
      if (json.ok) {
        setStatus(`Saved ${json.file}`);
        await fetchList();
        onRefresh();
      } else {
        setStatus(json.error ?? "Save failed");
      }
    } catch {
      setStatus("Save failed");
    }
  };
  const handleLoad = async (name: string) => {
    try {
      const res = await fetch(
        `${apiBase}/load?name=${encodeURIComponent(name)}`,
      );
      const data = (await res.json()) as SerializedObject[];
      sceneActions.deserialize(data);
      onClose();
    } catch {
      setStatus("Load failed");
    }
  };
  return (
    <div
      style={{
        height: 200,
        borderTop: "1px solid #333",
        background: "#181818",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "6px 12px",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#aaa",
            textTransform: "uppercase",
            letterSpacing: 1,
            flex: 1,
          }}
        >
          Prefabs
        </span>
        <input
          value={saveName}
          onChange={(e) => {
            setSaveName(e.target.value);
            setStatus(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
          placeholder="Prefab name…"
          style={{ ...textInputStyle, width: 160 }}
        />
        <button onClick={handleSave} style={btnStyle}>
          Save
        </button>
        {status && (
          <span style={{ fontSize: 11, color: "#888" }}>{status}</span>
        )}
        <button
          onClick={onClose}
          style={{ ...btnStyle, padding: "2px 8px", fontSize: 11, marginLeft: 4 }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
          display: "flex",
          alignItems: "stretch",
          padding: "8px 12px",
          gap: 8,
        }}
      >
        {prefabs.length === 0 && (
          <div
            style={{
              fontSize: 12,
              color: "#555",
              display: "flex",
              alignItems: "center",
            }}
          >
            No saved prefabs
          </div>
        )}
        {prefabs.map((name) => (
          <div
            key={name}
            onClick={() => handleLoad(name)}
            style={{
              minWidth: 110,
              maxWidth: 140,
              background: "#222",
              border: "1px solid #333",
              borderRadius: 4,
              padding: "8px 10px",
              fontSize: 12,
              color: "#ccc",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              flexShrink: 0,
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "#2a2a2a")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "#222")
            }
          >
            <span style={{ fontSize: 22, opacity: 0.6 }}>📄</span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                width: "100%",
                textAlign: "center",
                fontSize: 11,
              }}
            >
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toolbar({ onTogglePrefabs }: { onTogglePrefabs: () => void }) {
  return (
    <div
      style={{
        height: 40,
        background: "#1a1a1a",
        borderBottom: "1px solid #333",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        flexShrink: 0,
        zIndex: 201,
        position: "relative",
      }}
    >
      <span
        style={{ fontSize: 13, fontWeight: 600, color: "#aaa", marginRight: 8 }}
      >
        r3e
      </span>
      <button onClick={onTogglePrefabs} style={btnStyle}>
        Prefabs
      </button>
    </div>
  );
}
export default function App(): React.JSX.Element {
  const [transformDragging, setTransformDragging] = useState(false);
  const [transformMode, setTransformMode] =
    useState<TransformMode>("translate");
  const [showPrefabs, setShowPrefabs] = useState(false);
  const refreshRef = useRef(0);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        height: "100vh",
        background: "#1e1e1e",
        color: "#ccc",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Toolbar onTogglePrefabs={() => setShowPrefabs((v) => !v)} />
      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: 220,
            borderRight: "1px solid #333",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <HierarchyPane />
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <Canvas
            gl={async (props) => {
              const renderer = new THREE.WebGPURenderer(props as any);
              await renderer.init();
              return renderer;
            }}
            camera={{ position: [0, 2, 8], fov: 60 }}
            style={{ background: "#1a1a1a" }}
            onPointerMissed={() => sceneActions.select(null)}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 8, 5]} intensity={1} />
            <gridHelper args={[20, 20, "#333", "#2a2a2a"]} />
            <SceneContent
              onTransformDrag={setTransformDragging}
              transformMode={transformMode}
            />
            <OrbitControls makeDefault enabled={!transformDragging} />
          </Canvas>
          <TransformModeBar mode={transformMode} setMode={setTransformMode} />
        </div>

        <div
          style={{
            width: 240,
            borderLeft: "1px solid #333",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px 8px",
              borderBottom: "1px solid #333",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#aaa",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Inspector
            </span>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <InspectorPane />
          </div>
        </div>
      </div>
      {showPrefabs && (
        <PrefabPanel
          onClose={() => setShowPrefabs(false)}
          onRefresh={() => {
            refreshRef.current += 1;
          }}
        />
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#2a2a2a",
  color: "#ccc",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
  lineHeight: 1.4,
};

const numInputStyle: React.CSSProperties = {
  width: "100%",
  background: "#2a2a2a",
  border: "1px solid #3a3a3a",
  borderRadius: 3,
  color: "#ddd",
  fontSize: 11,
  padding: "3px 5px",
  textAlign: "right",
  boxSizing: "border-box",
};

const textInputStyle: React.CSSProperties = {
  background: "#2a2a2a",
  border: "1px solid #3a3a3a",
  borderRadius: 3,
  color: "#ddd",
  fontSize: 12,
  padding: "4px 8px",
  boxSizing: "border-box",
};
