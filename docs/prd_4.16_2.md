# OpenMindLearn PRD：macOS `.oml` 预览能力建设（2026-04-16）

## 1. 背景

当前在 macOS Finder 中选中 `.oml` 文件并按空格，无法获得有效预览，带来以下问题：

1. 用户无法在不打开应用的情况下快速识别文件内容。
2. 学习/复习场景下，多个 `.oml` 文件的筛选效率低。
3. 桌面端分发后，文件类型与系统能力的集成感不足。

同时，`.oml` 本质为 ZIP 归档，现有 Electron 打包配置尚未注册完整文档类型与预览链路。

## 2. 目标

1. 让 macOS 对 `.oml` 文件形成稳定识别（类型、图标、打开方式）。
2. 在 Finder 中按空格时，默认看到 `.oml` 的业务级增强预览（而非仅通用 ZIP 视图）。
3. 增强预览至少提供结构化摘要（标题、节点数、更新时间、标签/主题概览）。

## 3. 范围

本期包含：

1. `.oml` 的 macOS 文档类型注册（UTType + CFBundleDocumentTypes）。
2. Quick Look 原生扩展（`QLPreviewProvider` / `QLThumbnailProvider`）开发与集成。
3. `.oml` 预览元数据策略（`preview/summary.json` + 可选 `preview/thumbnail.png`）。
4. 桌面端打包、签名、公证链路中的扩展集成方案。

本期不包含：

1. 复杂的 Finder 内互动预览（编辑、搜索、跳转）。
2. Windows/Linux 文件预览扩展。
3. iCloud Drive/Spotlight 深度索引优化。

## 4. 核心方案设计

### 4.1 核心实现：Quick Look 增强预览（主线）

目标：用户在 Finder 中按空格即可看到 `.oml` 摘要视图，这是本期核心交付。

实施要点：

1. 新增 macOS 原生 Quick Look Extension（`QLPreviewProvider` / `QLThumbnailProvider`）。
2. 扩展读取 `.oml` 内容，优先展示以下信息：
   1. 文件标题（从结构信息或文件名推导）。
   2. 节点总数、边总数、区域总数（若存在）。
   3. 最近更新时间。
   4. 标签/主题 TopN（若存在）。
3. 预览渲染采用轻量模板（HTML 或原生绘制），优先保证稳定性与加载速度。
4. Finder 缩略图使用 `QLThumbnailProvider`，可先输出品牌底图 + 节点数徽标。

### 4.2 配套能力：文档类型注册（基础能力）

实施要点：

1. 在 Electron 打包配置中注册 `.oml` 文档类型（支撑 Finder 识别）：
   1. 声明自定义 UTI，例如 `com.openmindlearn.oml`。
   2. 扩展名 `oml`，MIME 可定义为 `application/x-openmindlearn`。
   3. 让 UTI `conformsTo` 包含 `public.zip-archive` 与 `public.data`。
2. 在 `CFBundleDocumentTypes` 中声明应用可打开 `.oml`。
3. 配置文件图标（可选但建议），提升 Finder 可辨识度。

预期效果：

1. Finder 能稳定识别 `.oml` 为 OpenMindLearn 文档类型。
2. 双击可直接由 OpenMindLearn 打开。
3. 空格预览默认进入 OpenMindLearn Quick Look 增强视图。

技术现实：

1. Quick Look 是原生 Apple 扩展能力，不是纯 Electron/JS 插件可替代。
2. 需引入最小 Xcode 工程用于构建 `.appex`，再由打包流程集成。

### 4.3 `.oml` 预览数据策略（必须支持，允许渐进）

为降低 Quick Look 解析成本，在 `.oml` 内新增轻量元数据：

1. `preview/summary.json`：节点数量、标题、更新时间、标签统计。
2. `preview/thumbnail.png`（可选）：应用保存时生成的小图。

兼容策略：

1. 预览扩展优先读取 `preview/*`。
2. 旧文件无 `preview/*` 时，回退到即时解析 `structure.xml + nodes/*`，保证可预览。
3. 不影响现有 `.oml` 加载与编辑流程。

## 5. 影响模块（实施参考）

1. `packages/desktop/electron-builder.yml`：
   1. 增加 macOS 文档类型、UTType 声明。
   2. 为后续 `.appex` 集成预留打包字段。
2. `packages/backend/src/services/fileService.ts`：
   1. 保存逻辑生成 `preview/summary.json`（以及可选 `preview/thumbnail.png`）。
3. `packages/desktop/native/quicklook/*`（新增）：
   1. Quick Look 扩展原生工程与渲染逻辑。
   2. 与主 App 的类型声明、bundle 配置、签名配置。
4. `docs/`：
   1. 更新用户文档：`.oml` 在 macOS 的预览能力与限制说明。

## 6. 分阶段落地计划

### M1（P0）：基础设施与类型注册

1. 注册 `.oml` UTI 与 `CFBundleDocumentTypes`。
2. 搭建 Quick Look 扩展工程骨架并可被主 App 打包。
3. 完成打包验证（arm64）。

### M2（P0）：增强预览主功能

1. 生成 `preview/summary.json`（兼容旧格式）。
2. Quick Look 扩展读取 `.oml` 并渲染摘要预览。
3. 输出可识别缩略图（至少含文件类型与节点规模信息）。

### M3（P1）：发布链路与稳定性

1. 接入签名与公证流程。
2. 完成多版本 macOS 回归（至少主力版本 + 次新版本）。
3. 补充失败回退与错误态展示（损坏文件、超大文件、老文件）。

## 7. 验收标准

1. Finder 能识别 `.oml` 为 OpenMindLearn 文档类型。
2. 双击 `.oml` 默认由 OpenMindLearn 打开。
3. 在 Finder 中对 `.oml` 按空格，默认显示增强预览（非通用 ZIP 预览）。
4. 增强预览可展示至少：标题/文件名、节点数、更新时间。
5. 不影响现有 `.oml` 保存、加载、编辑主流程。
6. 打包签名与公证流程不因预览能力引入阻塞。

## 8. 风险与注意事项

1. 风险：Quick Look 扩展引入原生工程，构建和签名复杂度上升。  
   约束：锁定最小功能集，先保证摘要可见，再做视觉增强。
2. 风险：旧 `.oml` 无预览元数据导致解析耗时波动。  
   约束：优先读取 `preview/*`，并对回退解析设置超时与降级展示。
3. 风险：预览元数据可能引起格式演进成本。  
   约束：`preview/*` 均为可选字段，读取失败可回退，不阻断主读写。

## 9. 兼容性策略

1. 新旧 `.oml` 均可打开；旧文件无预览元数据时自动降级解析。
2. Quick Look 扩展不可用时，降级到系统基础预览，不影响文件打开。
3. 任何预览能力异常不得影响应用内加载文件。

## 10. 后续扩展（非本期）

1. Finder 缩略图缓存优化（大文件场景）。
2. Spotlight 元数据索引（标题/标签可检索）。
3. 预览模板主题化（学习模式、复习模式摘要）。
