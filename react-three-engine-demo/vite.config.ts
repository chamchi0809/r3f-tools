import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { reactThreeEnginePlugin } from "react-three-engine/vite";

export default defineConfig({
  plugins: [
    react(),
    reactThreeEnginePlugin({
      webgpu: true,
      editorPath: "/editor",
      savePath: "./prefabs",
      objects: {
        sprite2D: {
          module: "./src/Sprite2D",
          label: "Sprite2D",
        },
      },
    }),
  ],
  server: {
    port: 5174,
  },
});
