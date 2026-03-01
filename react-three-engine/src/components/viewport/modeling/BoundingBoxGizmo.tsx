import { useFrame, useThree } from "@react-three/fiber";
import React, { useMemo, useEffect, useRef } from "react";
import * as THREE from "three/webgpu";

/**
 * SketchUp-style bounding box: renders 12 wire-frame edges around the selected
 * mesh (world-space AABB) and three DOM labels anchored to the midpoints of the
 * W, H, and D edges. Labels are projected to screen space every frame so they
 * stay attached as the camera orbits.
 */
export function BoundingBoxGizmo({ mesh }: { mesh: THREE.Mesh }) {
  const { camera, size, gl } = useThree();

  // Stable line geometry — 12 edges × 2 vertices = 24 points = 72 floats.
  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(72), 3));
    return geo;
  }, []);
  useEffect(() => () => lineGeo.dispose(), [lineGeo]);

  // Three DOM labels (W, H, D) — created once, positioned every frame.
  const labelsRef = useRef<HTMLDivElement[]>([]);
  useEffect(() => {
    const COLORS = ["#ff8888", "#88ee99", "#88aaff"];
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
    // precise=true reads the position buffer directly instead of the cached
    // boundingBox, so edits made via flushPositions are reflected immediately.
    const box = new THREE.Box3().setFromObject(mesh, true);
    if (box.isEmpty()) return;
    const { min, max } = box;
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;

    // 8 corners (front face = minZ, back face = maxZ)
    const C: [number, number, number][] = [
      [min.x, min.y, min.z], // 0 front-bottom-left
      [max.x, min.y, min.z], // 1 front-bottom-right
      [max.x, max.y, min.z], // 2 front-top-right
      [min.x, max.y, min.z], // 3 front-top-left
      [min.x, min.y, max.z], // 4 back-bottom-left
      [max.x, min.y, max.z], // 5 back-bottom-right
      [max.x, max.y, max.z], // 6 back-top-right
      [min.x, max.y, max.z], // 7 back-top-left
    ];
    // 12 edges
    const E = [0,1, 1,2, 2,3, 3,0, 4,5, 5,6, 6,7, 7,4, 0,4, 1,5, 2,6, 3,7];
    const pts = new Float32Array(72);
    for (let i = 0; i < E.length; i += 2) {
      pts.set(C[E[i]], (i / 2) * 6);
      pts.set(C[E[i + 1]], (i / 2) * 6 + 3);
    }
    const attr = lineGeo.getAttribute("position") as THREE.BufferAttribute;
    attr.set(pts);
    attr.needsUpdate = true;

    // Midpoints of the three edges emanating from corner 0 (front-bottom-left).
    const midpoints = [
      new THREE.Vector3(cx,    min.y, min.z), // W: bottom-front edge
      new THREE.Vector3(min.x, cy,    min.z), // H: front-left vertical
      new THREE.Vector3(min.x, min.y, cz   ), // D: left-bottom depth edge
    ];
    const values = [max.x - min.x, max.y - min.y, max.z - min.z];
    const labels = ["W", "H", "D"];
    const rect = gl.domElement.getBoundingClientRect();
    const vw = size.width, vh = size.height;

    labelsRef.current.forEach((div, i) => {
      const ndc = midpoints[i].clone().project(camera);
      if (ndc.z > 1) { div.style.display = "none"; return; }
      div.style.display = "";
      div.style.left = `${rect.left + (ndc.x * 0.5 + 0.5) * vw}px`;
      div.style.top  = `${rect.top  + (1 - (ndc.y * 0.5 + 0.5)) * vh}px`;
      div.textContent = `${labels[i]} ${values[i].toFixed(2)}`;
    });
  });

  return (
    <lineSegments geometry={lineGeo}>
      <lineBasicMaterial color="#6699ff" transparent opacity={0.55} depthTest={false} />
    </lineSegments>
  );
}
