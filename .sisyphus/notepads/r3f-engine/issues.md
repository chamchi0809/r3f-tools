# Issues

## 2026-02-22 Task 1 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `lsp_diagnostics` on JSON failed: biome not installed.
- `bun run build` / `bun test` failed: bun not installed.
- Verified TypeScript files via lsp_diagnostics individually; JSON/overall verification pending.

## 2026-02-22 Task 2 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- TypeScript files in src/types passed individual LSP diagnostics.

## 2026-02-22 Task 3 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- App.tsx passed individual LSP diagnostics; UI not manually run.

## 2026-02-22 Task 5 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `lsp_diagnostics` on JSON failed: biome not installed.
- `bun run build` / `bun test` failed: bun not installed.
- pnpm install ran successfully (lockfile already up to date).

## 2026-02-22 Task 6 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- UI not manually run (no dev server yet).

## 2026-02-22 Task 7 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.

## 2026-02-22 Task 8 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- UI not manually run (no dev server yet).

## 2026-02-22 Task 9 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- UI not manually run (no dev server yet).

## 2026-02-22 Task 10 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- UI not manually run (no dev server yet).

## 2026-02-22 Task 11 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- UI not manually run (no dev server yet).

## 2026-02-22 Task 12 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- UI not manually run (no dev server yet).

## 2026-02-22 Task 13 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- WebGPU canvas not manually run (no dev server yet).

## 2026-02-22 Task 14 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- glTF model import not manually run (no dev server yet).

## 2026-02-22 Task 15 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- JSX export not manually run (no dev server yet).

## 2026-02-22 Task 16 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- Save/Load not manually run (no dev server yet).

## 2026-02-22 Task 17 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- Tool panel UI not manually run (no dev server yet).

## 2026-02-22 Task 20 verification blockers
- `lsp_diagnostics` at project level failed: no LSP server configured for extension.
- `bun run build` / `bun test` failed: bun not installed.
- Demo app not manually run (no dev server yet).

## 2026-02-22 Final verification blockers
- `pnpm lint` fails due to oxlint warnings in .opencode/skills/webgpu-threejs-tsl/* (outside react-three-engine scope).
- Project-level `lsp_diagnostics` fails because no LSP server is configured for directory scope.
- `bun run build` / `bun test` cannot run because bun is not installed.
- UI QA blocked by constraint: do not run dev server unless asked.

## 2026-02-22 Lint blocker (remaining)
- `pnpm lint` now fails only due to gltfjsx-ui/src/extension.ts unused variable `resolveWebviewAsset`.
- Fix requires editing gltfjsx-ui (outside react-three-engine) or updating lint configuration.

## 2026-02-22 Dev server shutdown
- Attempted to stop dev server after UI QA; PowerShell stop command failed inside bash (erroneous /usr/bin/bash.CommandLine substitution).
