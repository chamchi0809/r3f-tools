import React, { useEffect, useMemo, useState } from "react";
import "./styles.css";
//code --extensionDevelopmentPath "C:\Users\User\IdeaProjects\horror-game\tools\gltfjsx-vscode" --new-window .

type GltfjsxOptions = {
  inputFile: string;
  outputFile?: string;
  transform: boolean;
  instance: boolean;
  instanceAll: boolean;
  types: boolean;
  verbose: boolean;
  draco: boolean;
  shadows: boolean;
  meta: boolean;
  debug: boolean;
  precision?: number;
  root?: string;
  printWidth?: number;
  keepNames: boolean;
  keepGroups: boolean;
  bones: boolean;
  exportDefault: boolean;
  postProcess: boolean;
  autoSave: boolean;
};

type MessageToExtension =
  | { type: "gltfjsx:ready" }
  | { type: "gltfjsx:run"; payload: GltfjsxOptions }
  | { type: "gltfjsx:browseInput" }
  | { type: "gltfjsx:browseOutput" }
  | { type: "gltfjsx:saveState"; payload: GltfjsxOptions }
  | { type: "gltfjsx:openOutput"; payload: { path: string } };

type MessageFromExtension =
  | { type: "gltfjsx:state"; payload: GltfjsxOptions }
  | { type: "gltfjsx:patch"; payload: Partial<GltfjsxOptions> }
  | {
      type: "gltfjsx:result";
      payload: {
        success: boolean;
        stdout: string;
        stderr: string;
        command: string;
      };
    }
  | { type: "gltfjsx:error"; payload: { message: string } };

const DEFAULT_OPTIONS: GltfjsxOptions = {
  inputFile: "",
  outputFile: "",
  transform: false,
  instance: false,
  instanceAll: false,
  types: true,
  verbose: false,
  draco: false,
  shadows: false,
  meta: false,
  debug: false,
  precision: 2,
  root: "/models",
  printWidth: 120,
  keepNames: false,
  keepGroups: false,
  bones: false,
  exportDefault: false,
  postProcess: true,
  autoSave: false,
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => {
      postMessage: (message: MessageToExtension) => void;
    };
  }
}

const vscodeApi = window.acquireVsCodeApi?.();

const sendMessage = (message: MessageToExtension) => {
  vscodeApi?.postMessage(message);
};

const buildCommandPreview = (options: GltfjsxOptions) => {
  const parts: string[] = ["npx", "gltfjsx"];

  if (options.inputFile) {
    parts.push(options.inputFile);
  }

  if (options.transform) parts.push("--transform");
  if (options.instance) parts.push("--instance");
  if (options.instanceAll) parts.push("--instanceall");
  if (options.types) parts.push("--types");
  if (options.verbose) parts.push("--verbose");
  if (options.draco) parts.push("--draco");
  if (options.shadows) parts.push("--shadows");
  if (options.meta) parts.push("--meta");
  if (options.debug) parts.push("--debug");
  if (options.keepNames) parts.push("--keepnames");
  if (options.keepGroups) parts.push("--keepgroups");
  if (options.bones) parts.push("--bones");
  if (options.exportDefault) parts.push("--exportdefault");

  if (options.precision !== undefined) {
    parts.push("--precision", String(options.precision));
  }
  if (options.root) {
    parts.push("--root", options.root);
  }
  if (options.printWidth !== undefined) {
    parts.push("--printwidth", String(options.printWidth));
  }

  if (options.outputFile) {
    parts.push("--output", options.outputFile);
  }

  if (options.postProcess && options.outputFile) {
    parts.push("&&", "node", "scripts/fix-gltfjsx.mjs", options.outputFile);
  }

  return parts.join(" ");
};

const toNumber = (value: string) => {
  if (value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const App = () => {
  const [options, setOptions] = useState<GltfjsxOptions>(DEFAULT_OPTIONS);
  const [savedOptions, setSavedOptions] = useState<GltfjsxOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<{
    success: boolean;
    stdout: string;
    stderr: string;
    command: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const autoSaveTimeoutRef = React.useRef<number | null>(null);
  const isDirty = useMemo(
    () => JSON.stringify(options) !== JSON.stringify(savedOptions),
    [options, savedOptions],
  );

  const preview = useMemo(() => buildCommandPreview(options), [options]);

  useEffect(() => {
    sendMessage({ type: "gltfjsx:ready" });
  }, []);

  useEffect(() => {
    if (!options.autoSave) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = window.setTimeout(() => {
      const snapshot = { ...options };
      setSavedOptions(snapshot);
      sendMessage({ type: "gltfjsx:saveState", payload: snapshot });
    }, 500);

    return () => {
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [options]);

  useEffect(() => {
    const handler = (event: MessageEvent<MessageFromExtension>) => {
      const message = event.data;
      if (!message || typeof message !== "object") {
        return;
      }

      if (message.type === "gltfjsx:state") {
        const normalized = { ...DEFAULT_OPTIONS, ...message.payload };
        setOptions(normalized);
        setSavedOptions(normalized);
        return;
      }

      if (message.type === "gltfjsx:patch") {
        setOptions((prev) => ({ ...prev, ...message.payload }));
        return;
      }

      if (message.type === "gltfjsx:result") {
        setResult(message.payload);
        setError(null);
        setIsRunning(false);
        return;
      }

      if (message.type === "gltfjsx:error") {
        setError(message.payload.message);
        setIsRunning(false);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsRunning(true);
    sendMessage({ type: "gltfjsx:run", payload: options });
  };

  const updateOption = <K extends keyof GltfjsxOptions>(key: K, value: GltfjsxOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const snapshot = { ...options };
    setSavedOptions(snapshot);
    sendMessage({ type: "gltfjsx:saveState", payload: snapshot });
  };

  const handleResetSaved = () => {
    setOptions(savedOptions);
  };

  const handleResetDefault = () => {
    setOptions(DEFAULT_OPTIONS);
  };

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="app__eyebrow">R3F pipeline helper</p>
          <div className="app__title">
            <h1>gltfjsx UI</h1>
            <span
              className={`dirty-indicator ${isDirty ? "dirty-indicator--dirty" : "dirty-indicator--clean"}`}
            >
              {isDirty ? "Unsaved" : "Saved"}
            </span>
          </div>
        </div>
        <div className="app__actions">
          <button
            type="button"
            className={`button button--secondary ${isDirty ? "button--dirty" : ""}`}
            onClick={handleSave}
          >
            Save
          </button>
          <button type="button" className="button button--ghost" onClick={handleResetSaved}>
            Reset to saved
          </button>
          <button type="button" className="button button--ghost" onClick={handleResetDefault}>
            Reset to default
          </button>
          <button
            type="submit"
            form="gltfjsx-form"
            className="button button--primary"
            disabled={!options.inputFile || isRunning}
          >
            {isRunning ? "Converting..." : "Convert"}
          </button>
        </div>
      </header>

      <form id="gltfjsx-form" className="card" onSubmit={onSubmit}>
        <div className="grid two">
          <div className="field">
            <label htmlFor="inputFile" className="label-with-tooltip">
              <span>Input File (GLB/GLTF)</span>
              <span className="tooltip">?</span>
              <span className="tooltip__panel">
                Path to the .glb/.gltf file (relative to workspace root).
              </span>
            </label>
            <div className="field__inline">
              <input
                id="inputFile"
                type="text"
                placeholder="public/models/model.glb"
                value={options.inputFile}
                onChange={(event) => updateOption("inputFile", event.target.value)}
                required
              />
              <button
                type="button"
                className="button button--secondary"
                onClick={() => sendMessage({ type: "gltfjsx:browseInput" })}
              >
                Browse
              </button>
            </div>
            <p className="field__help">Relative path from workspace root.</p>
          </div>

          <div className="field">
            <label htmlFor="outputFile" className="label-with-tooltip">
              <span>Output File (.tsx/.jsx)</span>
              <span className="tooltip">?</span>
              <span className="tooltip__panel">Output component path (.tsx/.jsx).</span>
            </label>
            <div className="field__inline">
              <input
                id="outputFile"
                type="text"
                placeholder="src/models/Model.tsx"
                value={options.outputFile ?? ""}
                onChange={(event) => updateOption("outputFile", event.target.value)}
              />
              <button
                type="button"
                className="button button--secondary"
                onClick={() => sendMessage({ type: "gltfjsx:browseOutput" })}
              >
                Browse
              </button>
            </div>
            <p className="field__help">Optional. Defaults to GLTF filename.</p>
          </div>
        </div>

        <div className="divider" />

        <div className="grid three">
          <div className="field">
            <label htmlFor="precision" className="label-with-tooltip">
              <span>Precision</span>
              <span className="tooltip">?</span>
              <span className="tooltip__panel">Number of fractional digits in numeric values.</span>
            </label>
            <input
              id="precision"
              type="number"
              min={0}
              max={10}
              value={options.precision ?? ""}
              onChange={(event) => updateOption("precision", toNumber(event.target.value))}
            />
            <p className="field__help">0-10 decimal places.</p>
          </div>
          <div className="field">
            <label htmlFor="printWidth" className="label-with-tooltip">
              <span>Print Width</span>
              <span className="tooltip">?</span>
              <span className="tooltip__panel">Prettier print width for generated code.</span>
            </label>
            <input
              id="printWidth"
              type="number"
              min={40}
              max={200}
              value={options.printWidth ?? ""}
              onChange={(event) => updateOption("printWidth", toNumber(event.target.value))}
            />
            <p className="field__help">Prettier width (default 120).</p>
          </div>
          <div className="field">
            <label htmlFor="root" className="label-with-tooltip">
              <span>Root Path</span>
              <span className="tooltip">?</span>
              <span className="tooltip__panel">Root path used inside useGLTF().</span>
            </label>
            <input
              id="root"
              type="text"
              placeholder="/models"
              value={options.root ?? ""}
              onChange={(event) => updateOption("root", event.target.value)}
            />
            <p className="field__help">useGLTF root path.</p>
          </div>
        </div>

        <div className="divider" />

        <div className="options">
          <div className="options__group">
            <h3>Core</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.types}
                onChange={(event) => updateOption("types", event.target.checked)}
              />
              <span className="toggle__label">
                TypeScript types
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Generate .tsx output with type definitions.</span>
              </span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.shadows}
                onChange={(event) => updateOption("shadows", event.target.checked)}
              />
              <span className="toggle__label">
                Shadows
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Add castShadow and receiveShadow to meshes.</span>
              </span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.meta}
                onChange={(event) => updateOption("meta", event.target.checked)}
              />
              <span className="toggle__label">
                Metadata
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Include GLTF metadata as userData.</span>
              </span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.exportDefault}
                onChange={(event) => updateOption("exportDefault", event.target.checked)}
              />
              <span className="toggle__label">
                Export default
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Use export default instead of named export.</span>
              </span>
            </label>
          </div>
          <div className="options__group">
            <h3>Optimization</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.transform}
                onChange={(event) => updateOption("transform", event.target.checked)}
              />
              <span className="toggle__label">
                Transform for web
                <span className="tooltip">?</span>
                <span className="tooltip__panel">
                  Optimize assets and generate a -transformed file.
                </span>
              </span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.instance}
                onChange={(event) => updateOption("instance", event.target.checked)}
              />
              <span className="toggle__label">
                Instance duplicates
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Instance repeated geometry automatically.</span>
              </span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.instanceAll}
                onChange={(event) => updateOption("instanceAll", event.target.checked)}
              />
              <span className="toggle__label">
                Instance all
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Instance every mesh in the scene.</span>
              </span>
            </label>
          </div>
          <div className="options__group">
            <h3>Structure</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.keepNames}
                onChange={(event) => updateOption("keepNames", event.target.checked)}
              />
              <span className="toggle__label">
                Keep names
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Preserve original node names.</span>
              </span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.keepGroups}
                onChange={(event) => updateOption("keepGroups", event.target.checked)}
              />
              <span className="toggle__label">
                Keep empty groups
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Do not prune empty groups.</span>
              </span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.bones}
                onChange={(event) => updateOption("bones", event.target.checked)}
              />
              <span className="toggle__label">
                Declarative bones
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Lay out bones declaratively.</span>
              </span>
            </label>
          </div>
          <div className="options__group">
            <h3>Diagnostics</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.verbose}
                onChange={(event) => updateOption("verbose", event.target.checked)}
              />
              <span className="toggle__label">
                Verbose
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Enable verbose logging.</span>
              </span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.debug}
                onChange={(event) => updateOption("debug", event.target.checked)}
              />
              <span className="toggle__label">
                Debug
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Enable debug output from gltfjsx.</span>
              </span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={options.draco}
                onChange={(event) => updateOption("draco", event.target.checked)}
              />
              <span className="toggle__label">
                Draco decode
                <span className="tooltip">?</span>
                <span className="tooltip__panel">Use Draco decoder for compressed meshes.</span>
              </span>
            </label>
          </div>
        </div>

        <div className="divider" />

        <div className="field field--checkbox">
          <label className="toggle">
            <input
              type="checkbox"
              checked={options.autoSave}
              onChange={(event) => updateOption("autoSave", event.target.checked)}
            />
            <span className="toggle__label">
              Auto-save
              <span className="tooltip">?</span>
              <span className="tooltip__panel">
                Automatically saves the form after you stop typing for 0.5s.
              </span>
            </span>
          </label>
        </div>

        <div className="field field--checkbox">
          <label className="toggle">
            <input
              type="checkbox"
              checked={options.postProcess}
              onChange={(event) => updateOption("postProcess", event.target.checked)}
            />
            <span className="toggle__label">
              Post-fix (recommended)
              <span className="tooltip">?</span>
              <span className="tooltip__panel">
                Cleans up gltfjsx output: fixes types, paths, and component naming.
              </span>
            </span>
          </label>
        </div>

        <div className="preview">
          <h3>Command Preview</h3>
          <code>{preview}</code>
        </div>
      </form>

      <section className="card output">
        <div className="output__header">
          <h2>Run Output</h2>
          {result && options.outputFile && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() =>
                sendMessage({
                  type: "gltfjsx:openOutput",
                  payload: { path: options.outputFile ?? "" },
                })
              }
            >
              Open generated file
            </button>
          )}
        </div>
        {error && <p className="status status--error">{error}</p>}
        {result && (
          <div className={`result ${result.success ? "result--success" : "result--error"}`}>
            <p className="status">{result.success ? "✅ Success" : "❌ Failed"}</p>
            <div className="result__block">
              <h4>Command</h4>
              <pre>{result.command}</pre>
            </div>
            <div className="result__block">
              <h4>Output</h4>
              <pre>{result.stdout || "(no stdout)"}</pre>
            </div>
            <div className="result__block">
              <h4>Errors</h4>
              <pre>{result.stderr || "(no stderr)"}</pre>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
