import { injectGlobal } from "@emotion/css";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { DockviewReact, IDockviewPanelHeaderProps } from "dockview";
import "dockview/dist/styles/dockview.css";
import React, { useEffect, useRef, useState } from "react";
import { isModKey } from "./utils/platform";
import * as THREE from "three/webgpu";
import { HierarchyPane } from "./components/HierarchyPane";
import { HistoryPane } from "./components/HistoryPane";
import { InspectorPane } from "./components/InspectorPane";
import { SettingsPane } from "./components/SettingsPane";
import { PrefabPanel } from "./components/PrefabPanel";
import { TagsPane } from "./components/TagsPane";
import { SceneContent } from "./components/SceneContent";
import { EditorModeBar, type TransformMode } from "./components/Toolbar";

import { useModelingStore } from "./store/modelingStore";
import { sceneActions, useSceneStore } from "./store/sceneStore";
import { historyActions } from "./store/historyStore";
import { initCustomObjectRegistry } from "./customObjectRegistry";
import "./styles";
import {
  ViewportGizmo,
  ViewportGizmoAnimator,
} from "./components/ViewportGizmo";
import { BrushOverlay } from "./components/viewport/brush";
import { ModelingOverlay } from "./components/viewport/modeling";

// Initialise the custom object registry as early as possible so that the
// Hierarchy pane can show custom kinds as soon as the editor mounts.
void initCustomObjectRegistry();

const Viewport = () => {
  const [transformDragging, setTransformDragging] = useState(false);
  const [transformMode, setTransformMode] =
    useState<TransformMode>("translate");
  const editorMode = useModelingStore((s) => s.editorMode);
  const isModeling = editorMode === "modeling";
  const isBrush = editorMode === "brush";
  const [shiftHeld, setShiftHeld] = useState(false);

  const cameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(true); };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(false); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);


  // G/R/S + Delete shortcuts for object mode; Ctrl+Z/Y work in all modes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      // Undo/redo — always active regardless of editor mode
      if (isModKey(e) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        historyActions.undo();
        return;
      }
      if (isModKey(e) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        historyActions.redo();
        return;
      }
      // Object-mode-only shortcuts
      if (isModeling || isBrush) return;
      if (e.key === "g" || e.key === "G") setTransformMode("translate");
      else if (e.key === "r" || e.key === "R") setTransformMode("rotate");
      else if (e.key === "s" || e.key === "S") setTransformMode("scale");
      else if (e.key === "Delete" || e.key === "Backspace") {
        const sel = useSceneStore.getState().selectedUUID;
        if (sel) sceneActions.removeObject(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isModeling, isBrush]);
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        cursor: isBrush ? (shiftHeld ? "grab" : "crosshair") : "default",
      }}
    >
      <Canvas
        shadows="percentage"
        gl={async (props) => {
          const renderer = new THREE.WebGPURenderer(props as any);
          await renderer.init();
          return renderer;
        }}
        camera={{ position: [0, 2, 8], fov: 60 }}
        style={{ background: "#1a1a1a", cursor: "inherit" }}
      >
        <ViewportGizmoAnimator
          controlsRef={controlsRef}
          cameraRef={cameraRef}
        />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <gridHelper args={[20, 20, "#333", "#2a2a2a"]} />
        <SceneContent
          onTransformDrag={setTransformDragging}
          transformDragging={transformDragging}
          transformMode={transformMode}
          isModeling={isModeling || isBrush}
        />
        {isModeling && <ModelingOverlay />}
        {isBrush && <BrushOverlay />}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enabled={!transformDragging && !isBrush}
        />
      </Canvas>
      <ViewportGizmo cameraRef={cameraRef} controlsRef={controlsRef} />
      <EditorModeBar
        transformMode={transformMode}
        setTransformMode={setTransformMode}
      />
    </div>
  );
};

export default function App(): React.JSX.Element {
  const refreshRef = useRef(0);

  return (
    <div style={{ width: "100dvw", height: "100dvh" }}>
      <DockviewReact
        onReady={(e) => {
          e.api.addPanel({
            id: "hierarchy",
            title: "Hierarchy",
            component: "hierarchy",
            tabComponent: "default",
          });
          e.api.addPanel({
            id: "viewport",
            title: "Viewport",
            component: "viewport",
            tabComponent: "default",
            position: {
              referencePanel: "hierarchy",
              direction: "right",
            },
          });
          e.api.addPanel({
            id: "inspector",
            title: "Inspector",
            component: "inspector",
            tabComponent: "default",
            position: {
              referencePanel: "viewport",
              direction: "right",
            },
          });
          e.api.addPanel({
            id: "history",
            title: "History",
            component: "history",
            tabComponent: "default",
            position: {
              referencePanel: "inspector",
              direction: "within",
            },
          });
          e.api.addPanel({
            id: "settings",
            title: "Settings",
            component: "settings",
            tabComponent: "default",
            position: {
              referencePanel: "inspector",
              direction: "within",
            },
          });
          e.api.addPanel({
            id: "tags",
            title: "Tags",
            component: "tags",
            tabComponent: "default",
            position: {
              referencePanel: "inspector",
              direction: "within",
            },
          });
          e.api.addPanel({
            id: "prefabs",
            title: "Prefabs",
            component: "prefabs",
            tabComponent: "default",
            position: {
              direction: "below",
            },
          });
        }}
        components={{
          hierarchy: HierarchyPane,
          viewport: Viewport,
          inspector: InspectorPane,
          history: HistoryPane,
          settings: SettingsPane,
          tags: TagsPane,
          prefabs: () => (
            <PrefabPanel
              onClose={() => {}}
              onRefresh={() => {
                refreshRef.current += 1;
              }}
            />
          ),
        }}
        tabComponents={{
          default: (props: IDockviewPanelHeaderProps) => {
            return <div>{props.api.title}</div>;
          },
        }}
      />
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
