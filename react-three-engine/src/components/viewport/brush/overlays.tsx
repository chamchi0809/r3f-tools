import React, { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three/webgpu";

// ─── Height label DOM overlay ─────────────────────────────────────────────────

export function HeightLabelDom({
  height,
  screenX,
  screenY,
}: {
  height: number;
  screenX: number;
  screenY: number;
}) {
  const { gl } = useThree();
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const div = document.createElement("div");
    Object.assign(div.style, {
      position: "fixed",
      zIndex: "9999",
      pointerEvents: "none",
      background: "rgba(0,0,0,0.65)",
      color: "#88bbff",
      fontFamily: "monospace",
      fontSize: "12px",
      padding: "2px 6px",
      borderRadius: "3px",
      whiteSpace: "nowrap",
      userSelect: "none",
    });
    document.body.appendChild(div);
    elRef.current = div;
    return () => {
      document.body.removeChild(div);
    };
  }, []);

  useEffect(() => {
    if (!elRef.current) return;
    const rect = gl.domElement.getBoundingClientRect();
    elRef.current.style.left = `${rect.left + screenX + 14}px`;
    elRef.current.style.top = `${rect.top + screenY - 8}px`;
    elRef.current.textContent = `H: ${height.toFixed(2)}`;
  });

  return null;
}

// ─── Distance label DOM overlay ───────────────────────────────────────────────

export function DistanceLabelDom({
  from,
  to,
  screenX,
  screenY,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  screenX: number;
  screenY: number;
}) {
  const { gl } = useThree();
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const div = document.createElement("div");
    Object.assign(div.style, {
      position: "fixed",
      zIndex: "9999",
      pointerEvents: "none",
      background: "rgba(0,0,0,0.65)",
      color: "#f0a020",
      fontFamily: "monospace",
      fontSize: "12px",
      padding: "2px 6px",
      borderRadius: "3px",
      whiteSpace: "nowrap",
      userSelect: "none",
    });
    document.body.appendChild(div);
    elRef.current = div;
    return () => {
      document.body.removeChild(div);
    };
  }, []);

  useEffect(() => {
    if (!elRef.current) return;
    const rect = gl.domElement.getBoundingClientRect();
    elRef.current.style.left = `${rect.left + screenX + 14}px`;
    elRef.current.style.top = `${rect.top + screenY - 8}px`;
    elRef.current.textContent = `${from.distanceTo(to).toFixed(2)}`;
  });

  return null;
}

// ─── Cursor gizmo DOM overlay ─────────────────────────────────────────────────

export type GizmoVariant = "crosshair" | "snap" | "extrude";

function buildGizmoSvg(variant: GizmoVariant): string {
  switch (variant) {
    case "snap":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke="#44ff88" stroke-width="1.5" fill="none"/>
        <circle cx="12" cy="12" r="3" fill="#44ff88"/>
      </svg>`;
    case "extrude":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <line x1="12" y1="2" x2="12" y2="22" stroke="#88aaff" stroke-width="1.5"/>
        <polygon points="12,1 8,7 16,7" fill="#88aaff"/>
        <polygon points="12,23 8,17 16,17" fill="#88aaff"/>
        <circle cx="12" cy="12" r="2.5" fill="#88aaff"/>
      </svg>`;
    case "crosshair":
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <line x1="12" y1="1" x2="12" y2="11" stroke="#f0a020" stroke-width="1.5"/>
        <line x1="12" y1="13" x2="12" y2="23" stroke="#f0a020" stroke-width="1.5"/>
        <line x1="1" y1="12" x2="11" y2="12" stroke="#f0a020" stroke-width="1.5"/>
        <line x1="13" y1="12" x2="23" y2="12" stroke="#f0a020" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="2.5" fill="#f0a020"/>
      </svg>`;
  }
}

/**
 * DOM overlay that follows the mouse and renders an SVG gizmo.
 * Also hides the native cursor on the canvas while mounted.
 */
export function CursorGizmoDom({
  screenX,
  screenY,
  variant,
}: {
  screenX: number;
  screenY: number;
  variant: GizmoVariant;
}) {
  const { gl } = useThree();
  const elRef = useRef<HTMLDivElement | null>(null);
  const variantRef = useRef<GizmoVariant>(variant);
  variantRef.current = variant;

  // Mount: create div, hide native cursor
  useEffect(() => {
    const canvas = gl.domElement;
    const prevCursor = canvas.style.cursor;
    canvas.style.cursor = "none";

    const div = document.createElement("div");
    Object.assign(div.style, {
      position: "fixed",
      zIndex: "9998",
      pointerEvents: "none",
      transform: "translate(-50%, -50%)",
      userSelect: "none",
    });
    document.body.appendChild(div);
    elRef.current = div;

    return () => {
      canvas.style.cursor = prevCursor;
      document.body.removeChild(div);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update position and SVG every render
  useEffect(() => {
    if (!elRef.current) return;
    const rect = gl.domElement.getBoundingClientRect();
    elRef.current.style.left = `${rect.left + screenX}px`;
    elRef.current.style.top = `${rect.top + screenY}px`;
    elRef.current.innerHTML = buildGizmoSvg(variant);
  });

  return null;
}

// ─── Brush bounding box gizmo ─────────────────────────────────────────────────

/**
 * SketchUp-style bounding box for brush mode. Renders a wireframe rectangle
 * (phase 1) or full 3D box (phase 2) around the drawn shape, with W/D labels
 * on the floor plane and an H label on the vertical edge in phase 2. Label
 * divs are projected from 3D midpoints every frame so they stay on the edges
 * as the camera orbits.
 */
export function BrushBoundingBoxGizmo({
  points,
  height,
}: {
  points: THREE.Vector3[];
  height?: number;
}) {
  const { camera, size, gl } = useThree();

  // 12 edges × 2 vertices = 24 points = 72 floats (flat rect reuses the box)
  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(72), 3));
    return geo;
  }, []);
  useEffect(() => () => lineGeo.dispose(), [lineGeo]);

  // Three DOM labels (W, D, H) — H hidden in phase 1.
  const labelsRef = useRef<HTMLDivElement[]>([]);
  useEffect(() => {
    const COLORS = ["#ff8888", "#88aaff", "#88ee99"]; // W, D, H
    const divs = COLORS.map((color) => {
      const div = document.createElement("div");
      Object.assign(div.style, {
        position: "fixed",
        zIndex: "9999",
        pointerEvents: "none",
        transform: "translate(-50%, -50%)",
        background: "rgba(0,0,0,0.72)",
        border: `1px solid ${color}66`,
        borderRadius: "3px",
        padding: "1px 6px",
        fontFamily: "monospace",
        fontSize: "11px",
        color,
        userSelect: "none",
        whiteSpace: "nowrap",
      });
      document.body.appendChild(div);
      return div;
    });
    labelsRef.current = divs;
    return () => divs.forEach((d) => document.body.removeChild(d));
  }, []);

  useFrame(() => {
    const attr = lineGeo.getAttribute("position") as THREE.BufferAttribute;

    if (points.length < 2) {
      attr.array.fill(0);
      attr.needsUpdate = true;
      labelsRef.current.forEach((d) => (d.style.display = "none"));
      return;
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    const hasH = height !== undefined;
    const h = hasH ? height! : 0;
    const yBot = Math.min(0, h);
    const yTop = Math.max(0, h);
    const cx = (minX + maxX) / 2;
    const cy = (yBot + yTop) / 2;
    const cz = (minZ + maxZ) / 2;

    // 8 corners — for phase 1, yBot === yTop === 0, box degenerates to a rect.
    const C: [number, number, number][] = [
      [minX, yBot, minZ], // 0
      [maxX, yBot, minZ], // 1
      [maxX, yTop, minZ], // 2
      [minX, yTop, minZ], // 3
      [minX, yBot, maxZ], // 4
      [maxX, yBot, maxZ], // 5
      [maxX, yTop, maxZ], // 6
      [minX, yTop, maxZ], // 7
    ];
    const E = [0,1, 1,2, 2,3, 3,0, 4,5, 5,6, 6,7, 7,4, 0,4, 1,5, 2,6, 3,7];
    const pts = new Float32Array(72);
    for (let i = 0; i < E.length; i += 2) {
      pts.set(C[E[i]], (i / 2) * 6);
      pts.set(C[E[i + 1]], (i / 2) * 6 + 3);
    }
    attr.set(pts);
    attr.needsUpdate = true;

    const rect = gl.domElement.getBoundingClientRect();
    const vw = size.width, vh = size.height;

    const labelData: { pos: THREE.Vector3; text: string; idx: number }[] = [
      { pos: new THREE.Vector3(cx,    yBot, minZ), text: `W ${(maxX - minX).toFixed(2)}`, idx: 0 },
      { pos: new THREE.Vector3(minX,  yBot, cz  ), text: `D ${(maxZ - minZ).toFixed(2)}`, idx: 1 },
    ];
    if (hasH) {
      labelData.push({ pos: new THREE.Vector3(minX, cy, minZ), text: `H ${Math.abs(h).toFixed(2)}`, idx: 2 });
    }

    labelsRef.current.forEach((d) => (d.style.display = "none"));
    for (const { pos, text, idx } of labelData) {
      const div = labelsRef.current[idx];
      if (!div) continue;
      const ndc = pos.clone().project(camera);
      if (ndc.z > 1) continue;
      div.style.display = "";
      div.style.left = `${rect.left + (ndc.x * 0.5 + 0.5) * vw}px`;
      div.style.top  = `${rect.top  + (1 - (ndc.y * 0.5 + 0.5)) * vh}px`;
      div.textContent = text;
    }
  });

  return (
    <lineSegments geometry={lineGeo}>
      <lineBasicMaterial color="#f0a020" transparent opacity={0.55} depthTest={false} />
    </lineSegments>
  );
}
