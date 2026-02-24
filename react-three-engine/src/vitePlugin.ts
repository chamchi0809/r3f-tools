import type { Plugin } from "vite";

export interface ReactThreeEnginePluginOptions {
  /**
   * Enable WebGPU renderer support
   * @default true
   */
  webgpu?: boolean;
  /**
   * Pathname to host the editor UI
   * @default "/editor"
   */
  pathname?: string;
  /**
   * Additional plugin options (reserved for future use)
   */
  [key: string]: unknown;
}

/**
 * Vite plugin for React Three Fiber engine with WebGPU support
 *
 * @param options - Plugin configuration options
 * @returns Vite plugin object
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { reactThreeEnginePlugin } from 'react-three-engine/vite'
 *
 * export default defineConfig({
 *   plugins: [reactThreeEnginePlugin({ webgpu: true })]
 * })
 * ```
 */
export function reactThreeEnginePlugin(options: ReactThreeEnginePluginOptions = {}): Plugin {
  const { webgpu = true, pathname = "/editor", ..._rest } = options;
  const virtualEditorId = "virtual:react-three-engine/editor";
  const resolvedVirtualEditorId = `\0${virtualEditorId}`;

  return {
    name: "react-three-engine",

    enforce: "pre",

    config() {
      return {
        // Future: Add optimizations, aliases, etc.
        optimizeDeps: {
          include: ["react", "react-dom", "@react-three/fiber", "@react-three/drei", "three"],
        },
      };
    },

    configResolved(_config) {
      // Store resolved config for later use
      // Future: Setup WebGPU-specific configurations
      if (webgpu) {
        // Placeholder for WebGPU initialization
      }
    },

    resolveId(id) {
      if (id === virtualEditorId) {
        return resolvedVirtualEditorId;
      }
      return null;
    },

    load(id) {
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
      const editorModuleUrl = resolveWithBase(server.config.base, `/@id/${virtualEditorId}`);

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
      // Future: Inject WebGPU polyfills or initialization scripts
      return [];
    },

    transform(_code, _id) {
      // Future: Transform code for WebGPU compatibility
      return null;
    },
  };
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (trimmed === "" || trimmed === "/") {
    return "/editor";
  }
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
  if (!base || base === "./") {
    return "/";
  }
  const withLeading = base.startsWith("/") ? base : `/${base}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

// Default export for convenience
export default reactThreeEnginePlugin;
