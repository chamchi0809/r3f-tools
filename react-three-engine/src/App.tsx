import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import React, { useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { HierarchyPane } from "./components/HierarchyPane";
import { InspectorPane } from "./components/InspectorPane";
import { PrefabPanel } from "./components/PrefabPanel";
import { SceneContent } from "./components/SceneContent";
import {
  Toolbar,
  TransformModeBar,
  type TransformMode,
} from "./components/Toolbar";
import "./styles";
import { injectGlobal } from "@emotion/css";
import styled from "@emotion/styled";

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

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Hierarchy */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: "1px solid #333",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <HierarchyPane />
        </div>

        {/* Viewport */}
        <div style={{ flex: 1, position: "relative" }}>
          <Canvas
            gl={async (props) => {
              const renderer = new THREE.WebGPURenderer(props as any);
              await renderer.init();
              return renderer;
            }}
            camera={{ position: [0, 2, 8], fov: 60 }}
            style={{ background: "#1a1a1a" }}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 8, 5]} intensity={1} />
            <gridHelper args={[20, 20, "#333", "#2a2a2a"]} />
            <SceneContent
              onTransformDrag={setTransformDragging}
              transformDragging={transformDragging}
              transformMode={transformMode}
            />
            <OrbitControls makeDefault enabled={!transformDragging} />
          </Canvas>
          <TransformModeBar mode={transformMode} setMode={setTransformMode} />
        </div>

        {/* Inspector */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            borderLeft: "1px solid #333",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{ padding: "10px 12px 8px", borderBottom: "1px solid #333" }}
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

injectGlobal`
  /* Box sizing rules */
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  /* Prevent font size inflation */
  html {
    -moz-text-size-adjust: none;
    -webkit-text-size-adjust: none;
    text-size-adjust: none;
  }

  /* Remove default margin in favour of better control in authored CSS */
  body,
  h1,
  h2,
  h3,
  h4,
  p,
  figure,
  blockquote,
  dl,
  dd {
    margin-block-end: 0;
  }

  /* Remove list styles on ul, ol elements with a list role, which suggests default styling will be removed */
  ul[role="list"],
  ol[role="list"] {
    list-style: none;
  }

  /* Set core body defaults */
  body {
    min-height: 100vh;
    line-height: 1.5;
    margin: 0;
  }

  /* Set shorter line heights on headings and interactive elements */
  h1,
  h2,
  h3,
  h4,
  button,
  input,
  label {
    line-height: 1.1;
  }

  /* Balance text wrapping on headings */
  h1,
  h2,
  h3,
  h4 {
    text-wrap: balance;
  }

  /* A elements that don't have a class get default styles */
  a:not([class]) {
    text-decoration-skip-ink: auto;
    color: currentColor;
  }

  /* Make images easier to work with */
  img,
  picture {
    max-width: 100%;
    display: block;
  }

  /* Inherit fonts for inputs and buttons */
  input,
  button,
  textarea,
  select {
    font-family: inherit;
    font-size: inherit;
  }

  /* Make sure textareas without a rows attribute are not tiny */
  textarea:not([rows]) {
    min-height: 10em;
  }

  /* Anything that has been anchored to should have extra scroll margin */
  :target {
    scroll-margin-block: 5ex;
  }
`;
