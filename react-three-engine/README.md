# React Three Engine

A React Three Fiber engine with WebGPU support. This package provides a scene manager, entity store, and a webview editor for R3F-based projects.

## Features

- **WebGPU-Only**: Leverages the power of the `WebGPURenderer` for modern graphics.
- **Entity Store**: Zustand-powered entity management for shapes, lights, and models.
- **Selection System**: Highlighting and interaction management for scene entities.
- **Transform Controls**: Interactive gizmos for translating, rotating, and scaling objects.
- **glTF Loading**: Support for importing local glTF/GLB files via blob URLs.
- **Export to JSX**: Generate `gltfjsx`-style React components from the current scene.
- **Save/Load Scene**: Persistence via JSON serialization.

## Prerequisites

- **WebGPU Support**: Requires a browser with WebGPU enabled (Chrome 113+, Edge 113+, Safari TP).
- **Node.js/pnpm**: Built for use in the `r3f-tools` workspace.

## Dependencies

The following peer dependencies are required:
- `react` >= 18.0.0
- `react-dom` >= 18.0.0
- `three` >= 0.160.0

Included dependencies:
- `@react-three/fiber` ^9.0.0
- `@react-three/drei` ^10.0.0
- `zustand` ^5.0.0

## Setup

```bash
pnpm install
```

## Running the Demo Editor

To run the development server and build the engine:

```bash
pnpm dev
```

The editor is accessible at `/editor` by default when integrated into the `r3f-tools` workspace or when using the provided Vite plugin. You can customize the URL via the plugin's `pathname` option.

## Known Limitations

- **Persistence**: glTF model blob URLs are not persisted between saves. You must reload local models manually after loading a scene JSON.
- **WebGPU Browser Support**: The engine will fail to initialize if WebGPU is not supported by the browser. No WebGL fallback is provided by design to ensure modern rendering standards.
- **Static Export**: Currently, only positions are exported to JSX. Rotations and scales are visual-only in the editor and not yet synced to the export state.

## License

MIT
