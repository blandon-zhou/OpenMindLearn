# OpenMindLearn

基于网状知识图谱画布的交互式学习系统。

[English](./README.md) | [简体中文](./README_zh.md)

## 项目简介

OpenMindLearn 帮助你以“节点关联”而不是“线性笔记”的方式组织、扩展和回顾知识。
当前包含：

- 无限画布的图谱编辑与节点扩展
- 基于 LLM 的节点生成与扩展
- Markdown 内容渲染
- 节点图片附件
- 通用文件附件（单文件最大 50 MB）与下载
- `.oml` 项目文件保存与加载
- 中英文界面基础支持（`en-US`、`zh-CN`）

## 技术栈

- 前端：React、TypeScript、Vite、Zustand、React Flow
- 后端：Fastify、TypeScript
- 工程结构：pnpm monorepo
- 桌面端（可选）：Electron Shell

## 仓库结构

```text
.
├─ packages/
│  ├─ frontend/   # React + Vite 应用
│  ├─ backend/    # Fastify API
│  └─ desktop/    # Electron Shell（可选）
└─ docs/          # 产品与工程文档
```

## 环境要求

- Node.js 18+
- pnpm 8+

## 快速开始

1. 安装依赖：

```bash
pnpm install
```

2. 启动前后端开发服务：

```bash
pnpm dev
```

3. 打开应用，在 `Settings -> LLM` 中配置：

- API Key
- Base URL
- Model
- API Style（如需要）

运行时将优先使用应用内配置（Profile）作为 LLM 配置来源。

4. （可选）在 `packages/backend/.env` 配置后端服务参数：

```bash
HOST=127.0.0.1
PORT=15174
```

可选兼容默认值（仅在运行时 Profile 对应字段未设置时使用）：

```bash
GEMINI_BASE_URL=https://mg.aid.pub/v1
GEMINI_MODEL=Gemini-3.1-Pro
API_STYLE=openai_chat
```

访问：

- 前端：<http://localhost:5173>
- 后端：<http://127.0.0.1:15174>

## 构建

构建全部包：

```bash
pnpm build
```

按包构建：

```bash
pnpm -C packages/frontend build
pnpm -C packages/backend build
```

运行后端构建产物：

```bash
pnpm -C packages/backend start
```

## 桌面客户端

OpenMindLearn 提供可选的 Electron 桌面端（`packages/desktop`）。

开发模式运行桌面端（同时启动前端、后端和 Electron）：

```bash
pnpm dev:desktop
```

构建桌面端发布包：

```bash
pnpm build:desktop
```

当前打包目标：

- macOS（Apple Silicon / arm64）：`dmg` 与 `zip`

## 开发说明

- `.oml` 是基于 ZIP 的项目归档格式。
- 后端请求 `bodyLimit` 当前为 60 MB，以支持较大图谱载荷。
- 单个通用附件大小限制为 50 MB。

## 贡献

欢迎提交 Issue 与 PR。
提交 PR 前建议至少执行：

```bash
pnpm -C packages/frontend build
pnpm -C packages/backend build
```

## 开源协议

本项目采用 MIT 协议，详见 [LICENSE](./LICENSE)。
