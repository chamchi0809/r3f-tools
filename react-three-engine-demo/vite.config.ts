import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { reactThreeEnginePlugin } from "react-three-engine/vite";

export default defineConfig({
  plugins: [
    react(),
    reactThreeEnginePlugin({
      webgpu: true,
      pathname: "/__editor",
      savePath: "./prefabs",
    }),
  ],
  server: {
    port: 5174,
  },
});
