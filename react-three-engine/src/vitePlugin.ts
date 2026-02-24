import path from "node:path";
import fs from "node:fs";
import type { Plugin, ViteDevServer } from "vite";

export interface ReactThreeEnginePluginOptions {
  webgpu?: boolean;
  // The URL path where the editor will be served (e.g. "localhost:[your-port]/editor"). Defaults to "/editor".
  editorPath?: string;
  // The directory where prefabs will be saved. Defaults to "./prefabs".
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

  return {
    name: "react-three-engine",
    enforce: "pre",

    config() {
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

    resolveId(id) {
      if (id === virtualEditorId) return resolvedVirtualEditorId;
      if (id === virtualConfigId) return resolvedVirtualConfigId;
      return null;
    },

    load(id) {
      if (id === resolvedVirtualConfigId) {
        return `export const editorConfig = ${JSON.stringify({ savePath: savePath ?? null, apiBase })};\n`;
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

export default reactThreeEnginePlugin;
