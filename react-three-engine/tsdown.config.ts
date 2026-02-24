import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    vitePlugin: "src/vitePlugin.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: "dist",
  target: "es2022",
  platform: "browser",
  noExternal: ["@emotion/css", "@emotion/cache", "@emotion/serialize", "@emotion/utils", "@emotion/react", "@emotion/styled", "@emotion/sheet", "@emotion/hash", "@emotion/weak-memoize", "@emotion/memoize"],
  external: [
    "react",
    "react-dom",
    "@react-three/fiber",
    "@react-three/drei",
    "three",
    "vite",
  ],
});
