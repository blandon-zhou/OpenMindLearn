# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenMindLearn (开放思维学习) is an interactive learning system based on a mesh-structured knowledge graph. Users explore knowledge through text selection and LLM-powered expansion.

**Core Architecture:**
- Mesh-based knowledge graph (no strict hierarchy)
- Local-first with .oml file format (ZIP-based)
- Single-user application
- Context-aware: Parent node chain (up to 10 nodes) passed as XML to LLM

## Technology Stack

**Frontend:** React 18 + Vite + React Flow + Zustand + Tailwind + shadcn/ui
**Backend:** Fastify + TypeScript + Gemini (supports OpenAI/Claude via custom Base URL)
**Monorepo:** pnpm workspaces (packages: frontend, backend)

## Development Commands

```bash
# Setup
pnpm install

# Development (frontend: 5174, backend: 15174)
pnpm dev

# Build
pnpm build
```

After startup, configure LLM in `Settings -> LLM` (API Key / Base URL / Model / API Style).

## Key Components

**Frontend:**
- `components/Canvas.tsx` - Main orchestrator (ReactFlow nodes/edges, context menus)
- `components/NodeCard.tsx` - Node rendering (Markdown, text selection, expansion menu)
- `stores/graphStore.ts` - Zustand state (addNode, updateNode)

**Backend:**
- `routes/nodes.ts` - API endpoints (generate, expand)
- `services/llm.ts` - LLM integration

## Important Notes

- Chinese language project
- No database - file system + in-memory storage
- .oml format: ZIP containing structure.xml, nodes/*.md, resources/
