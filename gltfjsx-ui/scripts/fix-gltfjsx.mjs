#!/usr/bin/env node
/**
 * Post-process gltfjsx output files.
 * Usage: node scripts/fix-gltfjsx.mjs src/models/FileName.tsx
 */

import fs from "fs";
import path from "path";

const filePath = process.argv[2];
const rootFlagIndex = process.argv.indexOf("--root");
const rootPath = rootFlagIndex !== -1 ? process.argv[rootFlagIndex + 1] : "";

if (!filePath) {
  console.error("Usage: node scripts/fix-gltfjsx.mjs <file-path>");
  process.exit(1);
}

const absolutePath = path.resolve(filePath);

if (!fs.existsSync(absolutePath)) {
  console.error(`File not found: ${absolutePath}`);
  process.exit(1);
}

let content = fs.readFileSync(absolutePath, "utf-8");

// 1. Convert GLTF import to type-only import
content = content.replace(
  /import { GLTF } from 'three-stdlib'/,
  "import type { GLTF } from 'three-stdlib'",
);

// 2. Switch React import to JSX namespace (React 19+)
content = content.replace(/import React from 'react'/, "import type { JSX } from 'react'");

// 3. Fix animations type mismatch (GLTFAction[] -> THREE.AnimationClip[])
content = content.replace(/animations: GLTFAction\[\]/, "animations: THREE.AnimationClip[]");

// 4. Add "as unknown" to useGLTF cast for compatibility
content = content.replace(
  /useGLTF\(([^)]+)\) as GLTFResult/g,
  "useGLTF($1) as unknown as GLTFResult",
);

// 5. Normalize model path to root + filename (strip directories)
const sanitizeRoot = (value) => {
  if (!value) return "/models";
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const rootPrefix = sanitizeRoot(rootPath || "/models");
const getFileName = (value) => value.replace(/\\/g, "/").split("/").pop() || value;
const toRootedPath = (quote, value) =>
  `useGLTF(${quote}${rootPrefix}/${getFileName(value)}${quote})`;
const toRootedPreload = (quote, value) =>
  `useGLTF.preload(${quote}${rootPrefix}/${getFileName(value)}${quote})`;

content = content.replace(/useGLTF\((['"])([^'"]+\.(?:glb|gltf))\1\)/g, (_match, quote, value) =>
  toRootedPath(quote, value),
);
content = content.replace(
  /useGLTF\.preload\((['"])([^'"]+\.(?:glb|gltf))\1\)/g,
  (_match, quote, value) => toRootedPreload(quote, value),
);

// 6. Rename component: Model -> FileName-based component
const fileName = path.basename(filePath, path.extname(filePath));
const componentName = fileName.replace(/(^\w|-\w)/g, (match) =>
  match.replace("-", "").toUpperCase(),
);
content = content.replace(/function Model\(/, `function ${componentName}(`);
content = content.replace(/export default Model;/, `export default ${componentName};`);

fs.writeFileSync(absolutePath, content, "utf-8");
console.log(`✅ Fix applied: ${filePath}`);
