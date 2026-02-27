/**
 * inspector/TextureField.tsx
 *
 * Texture map slot picker — shows a thumbnail, opens a modal to browse
 * textures served by the dev-server API, and loads the selected texture.
 */
import React, { useState } from "react";
import * as THREE from "three/webgpu";
import { editorConfig } from "virtual:react-three-engine/config";
import { rowStyle, labelText } from "./styles";

interface TextureEntry { path: string; }

export function TextureField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: THREE.Texture | null | undefined;
  onChange: (tex: THREE.Texture | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [textures, setTextures] = useState<TextureEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const { apiBase } = editorConfig;

  const thumbUrl = value instanceof THREE.Texture
    ? (value.image as HTMLImageElement | undefined)?.src ?? null
    : null;

  const openModal = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/textures`);
      if (res.ok) setTextures(await res.json() as TextureEntry[]);
    } finally {
      setLoading(false);
    }
  };

  const pick = (path: string) => {
    setOpen(false);
    const loader = new THREE.TextureLoader();
    loader.load(path, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      // Store the original relative path so _readMaps can recover it on save.
      tex.userData.r3eUrl = path;
      onChange(tex);
    });
  };

  return (
    <>
      <div style={rowStyle}>
        <span style={labelText}>{label}</span>
        <div style={{
          width: 32, height: 32, flexShrink: 0,
          background: thumbUrl ? `url(${thumbUrl}) center/cover` : "#222",
          border: "1px solid #333", borderRadius: 2,
        }} />
        <button
          onClick={openModal}
          style={{
            fontSize: 10, padding: "2px 6px", background: "#2a2a2a",
            border: "1px solid #444", borderRadius: 3, color: "#ccc",
            cursor: "pointer", flexShrink: 0,
          }}
        >
          Set…
        </button>
        {value && (
          <button
            onClick={() => onChange(null)}
            style={{
              fontSize: 10, padding: "2px 6px", background: "#2a1a1a",
              border: "1px solid #553", borderRadius: 3, color: "#f88",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1a1a1a", border: "1px solid #333",
              borderRadius: 6, padding: 16, width: 480, maxHeight: 480,
              overflowY: "auto", display: "flex", flexDirection: "column", gap: 10,
            }}
          >
            <div style={{ fontSize: 12, color: "#aaa", marginBottom: 4 }}>
              Pick texture — <em style={{ color: "#555" }}>{label}</em>
            </div>
            {loading && <div style={{ fontSize: 11, color: "#555" }}>Loading…</div>}
            {!loading && textures.length === 0 && (
              <div style={{ fontSize: 11, color: "#555" }}>
                No images found in publicDir.
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {textures.map((t) => (
                <button
                  key={t.path}
                  onClick={() => pick(t.path)}
                  title={t.path}
                  style={{
                    background: "#111", border: "1px solid #333",
                    borderRadius: 3, padding: 2, cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  }}
                >
                  <img
                    src={t.path}
                    alt={t.path}
                    style={{ width: 64, height: 64, objectFit: "cover", display: "block" }}
                  />
                  <span style={{ fontSize: 9, color: "#666", maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.path.split("/").pop()}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                alignSelf: "flex-end", fontSize: 11, padding: "3px 10px",
                background: "#222", border: "1px solid #444", borderRadius: 3,
                color: "#aaa", cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
