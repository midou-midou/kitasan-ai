---
name: 用户角色
description: 用户的职业背景和技术专长
type: user
---
你是一位资深前端开发工程师，有 10 年前端开发经验，而且非常熟悉 three.js 的开发，有多年 3D 开发经验

# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Commands

- **Start dev server**: `pnpm dev` — runs Vite dev server with HMR on localhost:5173
- **Build for production**: `pnpm build` — outputs to `dist/`
- **Preview production build**: `pnpm preview` — serves the built `dist/` locally
- **Lint**: `pnpm lint` — runs ESLint across all `.js/.jsx` files (config in `eslint.config.js`)

No test framework is configured in this project.

## Architecture

This is a React + Vite application for displaying a 3D VRM (Virtual Reality Model) avatar in the browser. The stack is React 19, Three.js, and `@pixiv/three-vrm`.

**Core rendering flow**: `main.jsx` mounts `App` → `App.jsx` renders `VRMViewer` (the sole component) → `VRMViewer.jsx` creates a Three.js scene imperatively inside a `useEffect`, loads the VRM model via `GLTFLoader` + `VRMLoaderPlugin`, and runs a `requestAnimationFrame` loop calling `vrm.update(delta)` + `renderer.render()`.

**VRM model loading**: The VRM file (`kitasan.vrm`) exists in two locations — `public/kitasan.vrm` (served statically, currently used by the loader at path `/kitasan.vrm`) and `src/assets/model/kitasan.vrm` (an asset copy, not currently imported). The `VRMLoaderPlugin` is registered on the `GLTFLoader` parser to handle VRM-specific extensions. After loading, the model is rotated `Math.PI` on Y-axis to face the camera.

**Key libraries**:
- `three` — WebGL rendering (scene, camera, renderer, lights, clock)
- `@pixiv/three-vrm` — VRM format support (`VRMLoaderPlugin` for loading, `vrm.update(delta)` for animation/pose updates)
- React + Vite with `@vitejs/plugin-react` (Oxc-based transform)

**Project structure**: Minimal — only one component (`src/components/VRMViewer.jsx`). All Three.js logic is procedural inside that component's `useEffect`. There is no state management, no routing, and no separation of 3D logic into hooks or utilities. The renderer is attached to a container `div` sized to full viewport (`100vw × 100vh`).

**Cleanup**: The `useEffect` returns a cleanup function that disposes the WebGL renderer, but does not remove the canvas DOM element or dispose Three.js geometries/materials — potential memory leak on re-mounts.
