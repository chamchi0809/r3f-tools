import { useEffect, useRef, useState } from "react";
import { EditorModeBar, TransformMode } from "../Toolbar";
import { sceneActions, THREE, useModelingStore, useSceneStore } from "../..";
import { historyActions } from "../../store";
import { isModKey } from "../../utils/platform";
import { SplitViewport } from "../SplitViewport";

const Viewport = () => {
  const [transformDragging, setTransformDragging] = useState(false);
  const [transformMode, setTransformMode] =
    useState<TransformMode>("translate");
  const editorMode = useModelingStore((s) => s.editorMode);
  const isModeling = editorMode === "modeling";
  const isBrush = editorMode === "brush";
  const [shiftHeld, setShiftHeld] = useState(false);
  const [isSplitView, setIsSplitView] = useState(false);

  const cameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
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
      {/* Split-view toggle button */}
      <button
        onMouseDown={(e) => {
          e.stopPropagation();
          setIsSplitView((v) => !v);
        }}
        title="Toggle quad viewport"
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          zIndex: 100,
          background: isSplitView
            ? "rgba(80,100,220,0.55)"
            : "rgba(0,0,0,0.45)",
          border: `1px solid ${isSplitView ? "#6080cc" : "#555"}`,
          borderRadius: 4,
          color: "#ccc",
          cursor: "pointer",
          padding: "2px 6px",
          fontSize: 15,
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        ⊞
      </button>

      <SplitViewport
        isSplit={isSplitView}
        transformDragging={transformDragging}
        onTransformDrag={setTransformDragging}
        transformMode={transformMode}
        isModeling={isModeling}
        isBrush={isBrush}
        perspCameraRef={cameraRef}
        perspControlsRef={controlsRef}
      />

      <EditorModeBar
        transformMode={transformMode}
        setTransformMode={setTransformMode}
      />
    </div>
  );
};

export default Viewport;
