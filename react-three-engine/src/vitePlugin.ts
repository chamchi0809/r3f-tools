import path from "node:path";
import fs from "node:fs";
import type { Plugin, ViteDevServer, FSWatcher } from "vite";

export interface ReactThreeEnginePluginOptions {
  webgpu?: boolean;
  editorPath?: string;
  savePath?: string;
  [key: string]: unknown;
}

export function reactThreeEnginePlugin(
  options: ReactThreeEnginePluginOptions = {},
): Plugin {
  const {
    webgpu = true,
    editorPath: pathname = "/editor",
    savePath = "./prefabs",
    ..._rest
  } = options;
  const virtualEditorId = "virtual:react-three-engine/editor";
  const resolvedVirtualEditorId = `\0${virtualEditorId}`;
  const virtualConfigId = "virtual:react-three-engine/config";
  const resolvedVirtualConfigId = `\0${virtualConfigId}`;

  const PREFAB_EXT = ".r3eprefab";
  let resolvedSavePath: string | null = null;
  let apiBase: string;
  let isBuild = false;

  const prefabRefIds = new Map<string, string>();
  let prefabUrls: Record<string, string> | null = null;
  let dtsAbsPath: string | null = null;

  return {
    name: "react-three-engine",
    enforce: "pre",

    config(_cfg, { command }) {
      isBuild = command === "build";
      return {
        optimizeDeps: {
          include: [
            "react",
            "react-dom",
            "@react-three/fiber",
            "@react-three/drei",
            "three",
          ],
        },
      };
    },

    configResolved(config) {
      resolvedSavePath = savePath ? path.resolve(config.root, savePath) : null;
      apiBase = resolveApiBase(config.base, pathname);
    },

    buildStart() {
      if (!resolvedSavePath) return;
      dtsAbsPath = path.join(resolvedSavePath, "prefabs.d.ts");
      writePrefabsDts(resolvedSavePath, PREFAB_EXT, dtsAbsPath);
      if (!isBuild) return;
      prefabRefIds.clear();
      prefabUrls = null;
      let files: string[] = [];
      try {
        files = fs
          .readdirSync(resolvedSavePath)
          .filter((f) => f.endsWith(PREFAB_EXT));
      } catch {
        return;
      }
      for (const file of files) {
        const name = file.slice(0, -PREFAB_EXT.length);
        const filePath = path.join(resolvedSavePath, file);
        const source = fs.readFileSync(filePath);
        const refId = this.emitFile({ type: "asset", name: file, source });
        prefabRefIds.set(name, refId);
      }
    },

    generateBundle() {
      if (!isBuild || prefabRefIds.size === 0) return;
      const urls: Record<string, string> = {};
      for (const [name, refId] of prefabRefIds) {
        urls[name] = `/${this.getFileName(refId)}`;
      }
      prefabUrls = urls;
    },

    resolveId(id) {
      if (id === virtualEditorId) return resolvedVirtualEditorId;
      if (id === virtualConfigId) return resolvedVirtualConfigId;
      return null;
    },

    load(id) {
      if (id === resolvedVirtualConfigId) {
        const config = {
          savePath: savePath ?? null,
          apiBase,
          prefabUrls: prefabUrls ?? null,
        };
        return `export const editorConfig = ${JSON.stringify(config)};\n`;
      }
      if (id === resolvedVirtualEditorId) {
        return `import React from 'react'
import ReactDOM from 'react-dom/client'
import { App as EditorApp } from 'react-three-engine'
const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    React.createElement(React.StrictMode, null, React.createElement(EditorApp))
  )
}
`;
      }
      return null;
    },

    configureServer(server) {
      const editorPath = resolveEditorPath(server.config.base, pathname);
      const editorModuleUrl = resolveWithBase(
        server.config.base,
        `/@id/${virtualEditorId}`,
      );

      registerApiRoutes(server, apiBase, resolvedSavePath, PREFAB_EXT);

      if (resolvedSavePath) {
        const watchDir = resolvedSavePath;
        const dtsPath = path.join(watchDir, "prefabs.d.ts");
        const dtsFwd = dtsPath.replace(/\\/g, "/");
        const watcher: FSWatcher = server.watcher;
        watcher.add(watchDir);
        const regenerate = (changedPath: string) => {
          const fwd = changedPath.replace(/\\/g, "/");
          if (fwd === dtsFwd) return;
          if (changedPath.endsWith(PREFAB_EXT)) {
            writePrefabsDts(watchDir, PREFAB_EXT, dtsPath);
          }
        };
        watcher.on("add", regenerate);
        watcher.on("change", regenerate);
        watcher.on("unlink", regenerate);
      }

      server.middlewares.use(editorPath, async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          next();
          return;
        }

        const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React Three Engine Editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${editorModuleUrl}"></script>
  </body>
</html>`;

        try {
          const transformed = await server.transformIndexHtml(editorPath, html);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html");
          res.end(transformed);
        } catch (error) {
          next(error);
        }
      });
    },

    transformIndexHtml() {
      return [];
    },
    transform(_code, _id) {
      return null;
    },
  };
}

function registerApiRoutes(
  server: ViteDevServer,
  apiBase: string,
  saveDir: string | null,
  ext: string,
): void {
  const listRoute = `${apiBase}/list`;
  const saveRoute = `${apiBase}/save`;
  const loadRoute = `${apiBase}/load`;

  server.middlewares.use(async (req, res, next) => {
    const url = req.url?.split("?")[0] ?? "";

    if (url === listRoute && req.method === "GET") {
      if (!saveDir) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify([]));
        return;
      }
      try {
        fs.mkdirSync(saveDir, { recursive: true });
        const files = fs
          .readdirSync(saveDir)
          .filter((f) => f.endsWith(ext))
          .map((f) => f.slice(0, -ext.length));
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(files));
      } catch {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Failed to list prefabs" }));
      }
      return;
    }

    if (url === saveRoute && req.method === "POST") {
      if (!saveDir) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "savePath not configured" }));
        return;
      }
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const { name, data } = JSON.parse(body) as {
            name: string;
            data: unknown;
          };
          if (!name || typeof name !== "string")
            throw new Error("Invalid name");
          const safeName = name.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
          fs.mkdirSync(saveDir, { recursive: true });
          const filePath = path.join(saveDir, `${safeName}${ext}`);
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, file: `${safeName}${ext}` }));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Failed to save prefab" }));
        }
      });
      return;
    }

    if (url === loadRoute && req.method === "GET") {
      if (!saveDir) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "savePath not configured" }));
        return;
      }
      const qs = new URLSearchParams(req.url?.split("?")[1] ?? "");
      const name = qs.get("name");
      if (!name) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Missing name" }));
        return;
      }
      try {
        const safeName = name.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
        const filePath = path.join(saveDir, `${safeName}${ext}`);
        const content = fs.readFileSync(filePath, "utf-8");
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(content);
      } catch {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Prefab not found" }));
      }
      return;
    }

    next();
  });
}

function resolveApiBase(base: string | undefined, pathname: string): string {
  const resolvedBase = normalizeBase(base);
  const normalizedPathname = normalizePathname(pathname);
  return `${resolvedBase}__r3e_api${normalizedPathname}`
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (trimmed === "" || trimmed === "/") return "/editor";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
}

function resolveEditorPath(base: string | undefined, pathname: string): string {
  const resolvedBase = normalizeBase(base);
  const normalizedPathname = normalizePathname(pathname);
  const merged = `${resolvedBase}${normalizedPathname.replace(/^\//, "")}`;
  return merged.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function resolveWithBase(base: string | undefined, urlPath: string): string {
  const resolvedBase = normalizeBase(base);
  const sanitizedPath = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;
  return `${resolvedBase}${sanitizedPath}`.replace(/\/+/g, "/");
}

function normalizeBase(base: string | undefined): string {
  if (!base || base === "./") return "/";
  const withLeading = base.startsWith("/") ? base : `/${base}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

type SerializedObjectKind =
  | "mesh"
  | "group"
  | "ambientLight"
  | "directionalLight"
  | "pointLight"
  | "perspectiveCamera";

interface RawNode {
  kind: SerializedObjectKind;
  children: RawNode[];
}

const KIND_TO_THREE: Record<SerializedObjectKind, string> = {
  mesh: "THREE.Mesh",
  group: "THREE.Group",
  ambientLight: "THREE.AmbientLight",
  directionalLight: "THREE.DirectionalLight",
  pointLight: "THREE.PointLight",
  perspectiveCamera: "THREE.PerspectiveCamera",
};

function nodeToType(node: RawNode): string {
  const threeType = KIND_TO_THREE[node.kind] ?? "THREE.Object3D";
  if (node.children.length === 0) return threeType;
  const childTypes = node.children.map(nodeToType).join(", ");
  return `Omit<${threeType}, "children"> & { children: [${childTypes}] }`;
}

function generatePrefabsDts(saveDir: string, ext: string): string {
  let files: string[] = [];
  try {
    files = fs.readdirSync(saveDir).filter((f) => f.endsWith(ext));
  } catch {
    files = [];
  }
  const entries: string[] = [];
  for (const file of files) {
    const name = file.slice(0, -ext.length);
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(saveDir, file), "utf-8"),
      ) as RawNode[];
      const childTypes = raw.map(nodeToType).join(", ");
      const groupType = `Omit<import("three").Group, "children"> & { children: [${childTypes}] }`;
      entries.push(`    ${JSON.stringify(name)}: ${groupType};`);
    } catch {
      entries.push(`    ${JSON.stringify(name)}: import("three").Group;`);
    }
  }
  const body = entries.length > 0 ? entries.join("\n") : "";
  return [
    "import \"react-three-engine\";",
    "import * as THREE from \"three/webgpu\";",
    "",
    "declare module \"react-three-engine\" {",
    "  interface PrefabTypeRegistry {",
    body,
    "  }",
    "}",
    "",
  ].join("\n");
}

function writePrefabsDts(saveDir: string, ext: string, dtsPath: string): void {
  try {
    fs.mkdirSync(saveDir, { recursive: true });
    fs.writeFileSync(dtsPath, generatePrefabsDts(saveDir, ext), "utf-8");
  } catch {
  }
}

export default reactThreeEnginePlugin;
