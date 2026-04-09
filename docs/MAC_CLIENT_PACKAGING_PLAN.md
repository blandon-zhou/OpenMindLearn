# OpenMindLearn macOS 客户端打包方案

## 1. 目标与约束

### 目标
- 将当前 Web 形态（`frontend + backend`）封装为可安装的 macOS 桌面应用。
- 第一阶段优先“可用与稳定”，再优化包体和安全策略。
- 产物支持 Apple Silicon（`arm64`）并预留 Intel（`x64`）构建能力。

### 约束
- 现有后端是 Node.js + Fastify，短期不重写为 Rust。
- `.oml` 文件读写逻辑已在后端成熟，需要尽量复用。
- 应用为本地单用户模式，不依赖远程数据库。

---

## 2. 技术选型

### 推荐：Electron + electron-builder（Phase 1）
选择原因：
- 与现有 Node 后端天然兼容，可直接以子进程方式内嵌 Fastify。
- 改造成本最低，最快形成可分发 DMG。
- 生态成熟，签名、公证、自动更新链路完善。

### 备选：Tauri（Phase 2 可评估）
- 包体更小、内存更优，但当前 Node 后端需通过 sidecar 或重写，落地成本更高。
- 建议在 Electron 稳定后再做技术迁移评估。

---

## 3. 打包架构设计

```text
Electron Main Process
  ├─ 启动本地 Node Backend（子进程，监听 127.0.0.1:3000）
  ├─ 加载 Frontend 静态资源（Vite build 输出）
  └─ Preload 暴露安全 IPC（打开/保存文件、系统对话框）

Renderer (React)
  └─ 继续通过 http://127.0.0.1:3000 调用现有 API
```

关键点：
- Backend 仅监听 `127.0.0.1`，禁止 `0.0.0.0`。
- App 退出时由 Main Process 回收 Backend 子进程。
- 若 `3000` 被占用，启动时动态探测可用端口并注入给前端。

---

## 4. 仓库改造建议

新增包：`packages/desktop`（Electron 壳）

建议目录：
```text
packages/desktop/
  src/main.ts
  src/preload.ts
  package.json
  electron-builder.yml
```

根脚本新增：
- `pnpm dev:desktop`：同时启动 backend + frontend + electron。
- `pnpm build:desktop`：构建 frontend/backend 后打包桌面应用。

后端建议：
- 支持端口由环境变量注入（例如 `PORT`），避免硬编码 `3000`。

---

## 5. macOS 发布流程

### 本地开发构建
1. `pnpm build`（生成前后端产物）
2. `pnpm -C packages/desktop build:mac`（输出 `.dmg` 与 `.zip`）

### 签名与公证（正式分发）
- Apple Developer 证书：`Developer ID Application`
- Notarization：`notarytool`
- 关键环境变量（CI）：
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`
  - `CSC_LINK` / `CSC_KEY_PASSWORD`

建议产物：
- `OpenMindLearn-<version>-arm64.dmg`
- `OpenMindLearn-<version>-arm64-mac.zip`

---

## 6. 安全与体验要求

- `contextIsolation: true`、`nodeIntegration: false`。
- Renderer 不直接访问 Node API，只走 Preload 白名单接口。
- 文件系统操作集中在 Backend 或 Main/Preload，统一权限控制。
- 首次启动检查 API 配置可用性（不依赖 `.env` 存储密钥），缺失时引导到设置页。

---

## 7. 里程碑

### M1（1-2 天）
- 建立 `packages/desktop`，实现本地可运行桌面版。
- 可打开画布、调用 LLM、保存/加载 `.oml`。

### M2（1 天）
- 完成 `dmg` 打包与应用图标、应用名称、版本注入。

### M3（1 天）
- 接入签名与公证，输出可在默认 macOS 安全策略下安装的安装包。

---

## 8. 验收标准

- 双击 `.dmg` 安装后可正常启动，无需手工启动后端。
- 新建节点、划线扩展、保存/加载 `.oml` 全流程可用。
- 关闭 App 后无残留 backend 进程。
- 在 macOS 13+（arm64）可稳定运行。

---

## 9. 后续增强（非首发）

- 自动更新（`electron-updater`）。
- 通用二进制（`universal`）构建。
- 迁移评估到 Tauri（若追求更小包体/更低内存）。
