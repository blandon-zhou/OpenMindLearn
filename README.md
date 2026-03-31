# OpenMindLearn

Interactive learning system built on a graph-based knowledge canvas.

[English](./README.md) | [简体中文](./README_zh.md)

## Overview

OpenMindLearn helps you build, expand, and revisit knowledge as connected nodes instead of linear notes.
It includes:

- Infinite canvas graph editing with expandable nodes
- LLM-assisted node generation and expansion
- Markdown content rendering
- Node image attachments
- General file attachments (up to 50 MB per file) with download support
- Save/load as `.oml` project files
- Bilingual UI foundation (`en-US`, `zh-CN`)

## Tech Stack

- Frontend: React, TypeScript, Vite, Zustand, React Flow
- Backend: Fastify, TypeScript
- Workspace: pnpm monorepo
- Desktop (optional): Electron shell

## Repository Structure

```text
.
├─ packages/
│  ├─ frontend/   # React + Vite app
│  ├─ backend/    # Fastify API
│  └─ desktop/    # Electron shell (optional)
└─ docs/          # Product and engineering docs
```

## Prerequisites

- Node.js 18+
- pnpm 8+

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Configure backend environment:

Create `packages/backend/.env`:

```bash
GEMINI_API_KEY=your_api_key_here
```

Optional variables:

```bash
GEMINI_BASE_URL=https://mg.aid.pub/v1
GEMINI_MODEL=Gemini-3.1-Pro
API_STYLE=openai_chat
PORT=3000
HOST=127.0.0.1
```

3. Start frontend + backend:

```bash
pnpm dev
```

Open:

- Frontend: <http://localhost:5173>
- Backend: <http://127.0.0.1:3000>

## Build

Build all packages:

```bash
pnpm build
```

Build specific packages:

```bash
pnpm -C packages/frontend build
pnpm -C packages/backend build
```

Run built backend:

```bash
pnpm -C packages/backend start
```

## Desktop Client

OpenMindLearn includes an optional Electron desktop client (`packages/desktop`).

Run desktop app in development (starts frontend + backend + Electron):

```bash
pnpm dev:desktop
```

Create a desktop release package:

```bash
pnpm build:desktop
```

Current packaging target:

- macOS (Apple Silicon / arm64): `dmg` and `zip`

## Development Notes

- `.oml` files are ZIP-based project archives used for import/export.
- Backend request `bodyLimit` is configured to 60 MB to support large graph payloads.
- Individual file attachments are limited to 50 MB each.

## Contributing

Issues and pull requests are welcome.
Before opening a PR, please run:

```bash
pnpm -C packages/frontend build
pnpm -C packages/backend build
```

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
