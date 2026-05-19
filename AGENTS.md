# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace with two app packages:
- `packages/frontend`: React + Vite + TypeScript UI (canvas, node cards, settings, i18n).
- `packages/backend`: Fastify + TypeScript API (LLM adapters, parsing, `.oml` file I/O).

Core frontend code lives in `packages/frontend/src`:
- `components/` for UI and canvas views
- `hooks/` for behavior logic
- `stores/` for Zustand state
- `utils/` for pure helpers

Backend code lives in `packages/backend/src`:
- `routes/` for HTTP endpoints
- `services/` for LLM/file/context logic

Product and engineering docs are in `docs/`.

## Build, Test, and Development Commands
- `pnpm install`: install workspace dependencies.
- `pnpm dev`: run frontend (`:5174`) and backend (`:15174`) in parallel.
- `pnpm build`: build all packages.
- `pnpm -C packages/frontend build`: type-check + production build frontend.
- `pnpm -C packages/backend build`: compile backend to `dist/`.
- `pnpm -C packages/backend start`: run built backend.

## Coding Style & Naming Conventions
- Language: TypeScript (strict mode enabled in both packages).
- Indentation: 2 spaces; prefer single quotes; omit semicolons to match existing code.
- React components: `PascalCase` files (for example, `NodeDetailPanel.tsx`).
- Hooks: `useXxx` naming (for example, `useCanvasNodes.ts`).
- Utilities and store modules: `camelCase` file names (for example, `nodePosition.ts`, `settingsStore.ts`).
- Keep modules focused; extract shared logic into `hooks/` or `utils/` before files grow too large.

## Testing Guidelines
There is currently no dedicated automated test suite committed. Minimum PR validation is:
1. `pnpm -C packages/frontend build`
2. `pnpm -C packages/backend build`
3. Manual smoke test in the UI for touched flows (node expand/edit/save-load/region interactions).

When adding tests, prefer colocated `*.test.ts`/`*.test.tsx` near the module under test.

## Commit & Pull Request Guidelines
Follow Conventional Commit style used in history (`feat:`, `fix:`, `refactor:`, `docs:`).
- Keep subject lines imperative and scoped (for example, `feat: add draggable region creation`).
- One logical change per commit.

PRs should include:
1. What changed and why
2. Affected areas (`frontend`, `backend`, `docs`)
3. Validation steps run
4. Screenshots/GIFs for UI changes

## Security & Configuration Tips
- Store API keys in app settings secure storage (desktop keychain / browser session fallback), not `.env`.
- Do not commit API keys or generated local data files.
