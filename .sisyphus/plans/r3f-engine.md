# R3F Visual Scene Editor Development Plan

## TL;DR

> **Overview**: Development of a R3F (React Three Fiber) based visual scene editor
>
> - Entity-Trait architecture (GroupEntity, MeshEntity + traits)
> - Primitive shapes, glTF model import, transform/camera controls, lighting editing
> - Export to JSX (gltfjsx style), Save/Load

> **Key Deliverables**:
>
> - **react-three-engine** package (Tasks 1-19): components, Vite plugin, types
> - **react-three-engine-demo** package (Task 20): Vite dev server on port 5174

> **Estimated Effort**: Large | **Parallel Execution**: YES | **Package Dependencies**: react-three-engine → react-three-engine-demo

---

## Context

### Original Request

- Use Vite plugin
- Display web UI at a specific local URL
- Save as JSX

### Architecture

- Entity-Trait based (similar to Unity component system)
- Implement as custom components using R3F extend() function
- GroupEntity, MeshEntity (registered with extend)
- Traits: Mesh, Geometry, Material (provided by three.js)
- State management: Zustand

### Key Decisions (Metis Review)

- Entity-Trait → JSX mapping: type + props object method
- glTF import: drei's useGLTF (animations excluded)
- JSX export format: gltfjsx output style

---

## Work Objectives

### Must Have

- R3F v9 with WebGPU Renderer
- Entity-Trait type definitions
- Primitive shapes (Box, Sphere, Plane)
- glTF import (drei useGLTF)
- TransformControls (translate/rotate/scale)
- OrbitControls (camera)
- Lighting (Ambient, Directional, Point)
- JSX export + Save/Load (config.json)
- Prefab system (<Prefab prefabKey="abc"/>)
- Prefab editor (/editor path)
- Prefab key management

### Must NOT Have

- Animation editor, Physics engine, Post-processing
- Multiple cameras, Custom shader editor
- WebGL (WebGPU only)

### Definition of Done

- [ ] Editor loads at http://localhost:5174/editor
- [ ] Primitive shapes can be added/deleted
- [ ] glTF models can be imported
- [ ] Objects can be manipulated with transform controls
- [ ] Lights can be added/edited
- [ ] Can be exported to JSX file

---

## Verification Strategy

> All verification is executed by agents - no manual intervention.

---

## Execution Strategy

### Package Structure

| Package                 | Path                       | Purpose                                      |
| ----------------------- | -------------------------- | -------------------------------------------- |
| react-three-engine      | `react-three-engine/`      | Core library: components, Vite plugin, types |
| react-three-engine-demo | `react-three-engine-demo/` | Dev server: Vite on port 5174                |

### Package Dependency

```
react-three-engine-demo → react-three-engine
```

### Tasks by Package

**react-three-engine (Tasks 1-19):**

- Wave 1: Task 1, 2, 3, 5 (Infrastructure)
- Wave 2: Tasks 6-12 (Core features)
- Wave 3: Tasks 13-17 (Import/Export)
- Wave 4: Task 19 (Cleanup)

**react-three-engine-demo (Task 20):**

- Wave 4: Task 20 (Demo app)

### Key Dependency Paths

- react-three-engine: Tasks 1-5 → 6-12 → 13-17,19
- react-three-engine-demo: Task 20 depends on Task 19

---

## TODOs

- [ ] 1. Project scaffolding + setup

  **What to do**:
  - Create react-three-engine package in pnpm workspace
  - Create package.json (dependencies: react, react-dom, @react-three/fiber, @react-three/drei, three)
  - Configure tsconfig.json
  - Configure tsdown.config.ts (for build)
  - Create basic Vite plugin structure
  - Update pnpm-workspace.yaml

  **Must NOT do**:
  - WebGPU Renderer (use WebGPU only)
  - Vite dev server (provided by demo package)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Create project settings and package structure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 1, first task)
  - **Blocks**: Tasks 2-20
  - **Blocked By**: None

  **References**:
  - `gltfjsx-ui/package.json` - reference workspace package pattern
  - `pnpm-workspace.yaml` - workspace settings

  **Acceptance Criteria**:
  - [ ] Create react-three-engine directory
  - [ ] Add R3F dependencies to package.json
  - [ ] Create node_modules after pnpm install
  - [ ] tsdown build configuration complete
  - [ ] Create basic Vite plugin structure

  **Commit**: YES
  - Message: `feat(react-three-engine): add project scaffolding`
  - Files: `react-three-engine/`

- [ ] 2. Entity-Trait type definitions

  **What to do**:
  - Create type definitions for Entity-Trait system
  - Entity types: GroupEntity, MeshEntity
  - Trait types: GeometryTrait, MaterialTrait, MeshTrait
  - Define attributes for each trait (position, rotation, scale, color, opacity, etc.)

  **Must NOT do**:
  - Use ECS library (define types directly)
  - Complex trait dependency system

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Only type definition (no implementation)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 1)
  - **Blocks**: Tasks 6-12
  - **Blocked By**: Task 1

  **References**:
  - three.js geometry types: BoxGeometry, SphereGeometry, PlaneGeometry
  - three.js material types: MeshStandardMaterial, MeshBasicMaterial

  **Acceptance Criteria**:
  - [ ] Entity types exported
  - [ ] Trait interfaces defined
  - [ ] TypeScript compile check passed

  **Commit**: YES
  - Message: `feat(react-three-engine): add Entity-Trait types`
  - Files: `react-three-engine/src/types/`

- [ ] 3. Basic UI layout + Canvas

  **What to do**:
  - Create main App.tsx layout
  - Add R3F Canvas component
  - Basic scene setup (ambient light + camera)
  - Full screen layout

  **Must NOT do**:
  - Complex UI components
  - State management/context (simple useState only)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 1, 2)
  - **Blocks**: Tasks 6-12
  - **Blocked By**: Task 1, 2

  **References**:
  - `gltfjsx-ui/webview/src/App.tsx` - reference UI patterns

  **Acceptance Criteria**:
  - [ ] Verify Canvas rendering
  - [ ] Empty scene loaded

  **Commit**: YES
  - Message: `feat(react-three-engine): add basic UI layout and Canvas`
  - Files: `react-three-engine/src/App.tsx`

- [ ] 5. Install R3F v9 + WebGPU dependencies

  **What to do**:
  - Install @react-three/fiber@latest (v9), @react-three/drei@latest, three@0.182.0, zustand
  - Import three.js WebGPURenderer
  - Update package.json
  - Run pnpm install

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 1)
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] R3F packages installed in node_modules

  **Commit**: YES
  - Message: `feat(react-three-engine): install R3F dependencies`
  - Files: `react-three-engine/package.json`

- [ ] 6. Add primitive shapes (Box, Sphere, Plane)

  **What to do**:
  - BoxGeometry, SphereGeometry, PlaneGeometry components
  - Object creation button UI

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 3)
  - **Blocked By**: Task 3

  **Commit**: YES
  - Message: `feat(react-three-engine): add primitive shapes`
  - Files: `react-three-engine/src/components/`

- [ ] 7. Entity creation/deletion system

  **What to do**:
  - Entity state management (Zustand)
  - Addition/deletion functions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 2, 3)
  - **Blocked By**: Task 2, 3

  **Commit**: YES
  - Message: `feat(react-three-engine): add entity management`
  - Files: `react-three-engine/src/store/`

- [ ] 8. Selection system + highlighting

  **What to do**:
  - Select entity on click
  - Highlight selected entity (outline)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 7)
  - **Blocked By**: Task 7

- [ ] 9. TransformControls integration

  **What to do**:
  - Use drei TransformControls
  - Translate/rotate/scale modes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 8)
  - **Blocked By**: Task 8

- [ ] 10. OrbitControls integration

  **What to do**:
  - Use drei OrbitControls
  - Disable on selection

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 3)
  - **Blocked By**: Task 3

- [ ] 11. Add lights (Ambient, Directional, Point)

  **What to do**:
  - Light entity types
  - Light creation UI

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 3)
  - **Blocked By**: Task 3

- [ ] 12. Hierarchy panel (read-only)

  **What to do**:
  - Entity tree view
  - Select on click

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 7)
  - **Blocked By**: Task 7

- [ ] 13. WebGPU Renderer setup

  **What to do**:
  - Use three.js WebGPURenderer
  - Canvas configuration compatible with R3F v9

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 3)
  - **Blocked By**: Task 3

- [ ] 14. glTF model import

  **What to do**:
  - Use drei useGLTF
  - File selection UI

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 3, 7)
  - **Blocked By**: Task 3, 7

- [ ] 15. JSX export (gltfjsx style)

  **What to do**:
  - Convert entity → JSX code
  - Reference gltfjsx output format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Tasks 6-12)
  - **Blocked By**: Tasks 6-12

- [ ] 16. Config file + Save/Load

  **What to do**:
  - Set savePath in config.json
  - Save scene in JSON format
  - Load saved scene

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Depends on Task 7)
  - **Blocked By**: Task 7

- [ ] 17. Tool panel UI

  **What to do**:
  - Add Object menu
  - Transform mode toggle
  - Save/Load buttons

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 6, 9, 16

- [ ] 19. Code cleanup + documentation
  - Clean up comments
  - Write README
  - **Category**: `writing`
  - **Blocked By**: Task 16

- [ ] 20. Demo app creation + verification
  - Create react-three-engine-demo package
  - Import and use react-three-engine
  - Configure Vite dev server (port 5174)
  - Integrate react-three-engine Vite plugin into demo
  - Verify editor access at /editor path
  - Verify basic scene rendering
  - **Category**: `unspecified-high`
  - **Blocked By**: Task 19
  - **Commit**: YES
  - Message: `feat(demo): add react-three-engine demo app`
  - Files: `react-three-engine-demo/`

## Final Verification Wave

> After all implementations, 3 verification agents run in parallel.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Verify all "Must Have" items from the plan are implemented
      Output: `Must Have [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Verify TypeScript build and lint pass
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | VERDICT`

---

## Commit Strategy

- Per-wave commit: `feat(react-three-engine): add Wave N features`
- Files: Changed files in `react-three-engine/` directory
- Demo app: `react-three-engine-demo/` (separate commit in Task 20)

---

## Success Criteria

### Verification Commands

```bash
# Run Demo app
cd react-three-engine-demo && pnpm dev

# Access http://localhost:5174 in browser
# Verify editor load at /editor path
```

### Final Checklist

- [ ] All Must Have items implemented
- [ ] Must NOT Have items not implemented
- [ ] TypeScript build passes
