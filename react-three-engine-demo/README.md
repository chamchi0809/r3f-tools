# React Three Engine Demo

Demo application showcasing the `react-three-engine` package with WebGPU support.

## Development

Start the development server on port 5174:

```bash
pnpm dev
```

Then navigate to:
- http://localhost:5174/ - Home page
- http://localhost:5174/editor - Editor UI

## Build

```bash
pnpm build
```

## Features

- Uses `react-three-engine` workspace package
- Vite development server with HMR
 Minimal client-side routing (no router library)
- TypeScript support
- WebGPU-enabled via react-three-engine Vite plugin

## Requirements

- Browser with WebGPU support (Chrome 113+, Edge 113+, Safari TP)
- Node.js and pnpm
