# OpenMindLearn PRD：多文件同时打开与并行学习工作区（2026-04-16）

## 1. 背景

当前编辑器采用单文件工作模式（单一 `fileName/currentFilePath/nodes/edges` 状态），导致以下问题：

1. 用户无法同时打开多个 `.oml` 文件做对照学习与复习。
2. 需要在不同文件间频繁“打开-覆盖-再打开”，上下文切换成本高。
3. 无法在一个文件中编辑、另一个文件中查阅，影响多任务效率。

## 2. 目标

1. 支持同一会话同时打开多个 `.oml` 文件。
2. 支持在多个已打开文件间快速切换与编辑，并保持各自独立脏状态。
3. 提供可控关闭流程（未保存确认），避免误操作丢数据。
4. 保持现有生成、节点编辑、区域、版本、搜索等核心功能在多文件模式下行为一致。

## 3. 范围

本期包含：

1. 多文件工作区状态模型（前端）。
2. 顶部文件标签栏（Tabs）与文件生命周期交互（打开/切换/关闭）。
3. 单文件操作在多文件上下文中的适配（保存、另存、加载、新建、草稿恢复）。
4. 最小可用快捷键支持（切换标签、关闭标签、保存当前标签）。

本期不包含：

1. 画布分屏并排编辑（Split View）。
2. 跨文件节点复制引用协议。
3. 云端工作区与多端同步。

## 4. 核心方案设计

### 4.1 状态模型重构（Single Doc -> Workspace）

将当前 `graphStore` 的单文档字段升级为“工作区 + 多文档”结构：

```ts
type DocId = string

interface GraphDocumentState {
  id: DocId
  fileName: string
  currentFilePath: string | null
  isDirty: boolean
  nodes: Node[]
  regions: Region[]
  edges: Edge[]
  ui: {
    initialInput: string
    initialGenerating: boolean
    initialImages: NodeImage[]
    initialAttachments: NodeAttachment[]
    // 可按需扩展：搜索态、详情面板态
  }
  updatedAt: string
}

interface WorkspaceState {
  activeDocId: DocId | null
  openedDocIds: DocId[]
  docsById: Record<DocId, GraphDocumentState>
}
```

关键约束：

1. “当前画布”仅来源于 `activeDocId` 对应文档。
2. 每个文档独立维护 `isDirty`，禁止全局单一脏标记。
3. 文档关闭后必须从 `openedDocIds/docsById` 同步移除，避免幽灵状态。

### 4.2 UI 交互（标签栏）

在 Toolbar 左侧文件名区域升级为标签栏：

1. 每个打开文件展示一个 Tab（名称 + 脏点 + 关闭按钮）。
2. 当前激活 Tab 高亮，点击即切换。
3. `+` 新建空白文档（`Untitled`）。
4. `打开文件` 支持追加打开，不覆盖现有文档。

关闭规则：

1. 关闭干净文档：直接关闭。
2. 关闭脏文档：弹出确认（保存并关闭 / 不保存 / 取消）。
3. 关闭最后一个文档：自动创建一个空白 `Untitled` 文档，保证工作区可用。

### 4.3 文件 I/O 适配

将 `useCanvasFileIO` 从“全局唯一文档”改为“面向 activeDoc 的操作器”：

1. `Save`：保存当前 activeDoc。
2. `Save As`（可选但建议）: 为当前文档选择新路径。
3. `Load`：从文件选择器读取后创建新 Doc 并加入标签。
4. `New`：创建新 Doc，不清空其他已打开文件。

说明：

1. 后端 `saveFile/loadFile` 接口保持不变，无需改协议。
2. 浏览器模式下载文件名取 activeDoc 的 `fileName`。

### 4.4 草稿与恢复策略

当前 `local draft` 为单 key（`oml-local-draft-v1`），需改为按文档维度保存：

1. 方案 A（推荐）：按 `docId` 分桶存储，外加工作区索引。
2. 方案 B：单对象内维护 `docsById`（结构更大，但读取一次完成）。

恢复流程：

1. 启动时检测是否存在工作区草稿。
2. 用户确认后恢复多个文档与 activeDoc。
3. 恢复失败时允许降级到单文档恢复，避免整包失败。

### 4.5 事件与快捷键

最低支持：

1. `Cmd/Ctrl + S`：保存当前标签。
2. `Cmd/Ctrl + W`：关闭当前标签（走未保存确认流程）。
3. `Cmd/Ctrl + Shift + ] / [`：切换前后标签。

## 5. 影响模块（实施参考）

前端重点：

1. `packages/frontend/src/stores/graphStore.ts`（重构为 workspace store）
2. `packages/frontend/src/hooks/useCanvasFileIO.ts`（按 activeDoc 操作）
3. `packages/frontend/src/hooks/useCanvasLocalDraft.ts`（多文档草稿）
4. `packages/frontend/src/components/Toolbar.tsx`（标签栏与文件动作）
5. `packages/frontend/src/components/canvas/Canvas.tsx`（绑定 activeDoc 数据）
6. `packages/frontend/src/i18n/locales/zh-CN.ts`
7. `packages/frontend/src/i18n/locales/en-US.ts`

后端：

1. 预期无需协议变更，仅需确认现有保存/加载接口可复用。

## 6. 分阶段落地计划

### M1（P0）：状态与标签骨架

1. 落地 WorkspaceState 与基础 actions（open/switch/close/new）。
2. Toolbar 展示标签栏，支持切换与关闭。
3. 画布渲染绑定 activeDoc。

### M2（P0）：文件读写与脏状态

1. `Load` 改为追加打开文档。
2. `Save`/`New`/`Close` 全量适配 activeDoc。
3. 未保存关闭确认流程打通。

### M3（P1）：草稿与快捷键完善

1. 多文档草稿恢复。
2. 标签快捷键与边界行为优化。
3. i18n 文案补齐与可用性抛光。

## 7. 验收标准

1. 可同时打开至少 5 个 `.oml` 文件并快速切换，数据互不污染。
2. 任一标签编辑后仅该标签显示脏状态。
3. 关闭脏标签必触发确认，取消后数据不丢失。
4. 保存当前标签后脏状态清除，不影响其他标签。
5. 刷新后可恢复上次工作区（至少恢复打开文件列表与 activeDoc）。

## 8. 风险与注意事项

1. 风险：Canvas 内部局部状态（详情面板/搜索/版本弹窗）可能引用旧 doc 数据。  
   约束：切换标签时统一 reset 与重建关联状态。
2. 风险：一次打开大量大图节点文件会导致内存上涨。  
   约束：首期限制最大打开数（建议 10），并在超限时提示。
3. 风险：多文档草稿体积过大导致 localStorage 写入失败。  
   约束：保留写入失败提示，并提供按需裁剪策略（仅保留最近 N 个文档草稿）。

## 9. 兼容性策略

1. 旧单文档状态迁移：首次启动将旧结构映射为 `openedDocIds = [defaultDocId]`。
2. 旧草稿 key 兼容：优先读取新 key，若不存在再尝试旧 key 并一次性迁移。
3. 对用户行为保持兼容：`打开/保存/新建` 的按钮语义不变，只是作用域从“全局唯一文档”变为“当前标签文档”。

## 10. 后续扩展（非本期）

1. 双栏分屏（同窗口并排对照两个标签）。
2. 跨文件搜索与全局节点索引。
3. 工作区会话导出（一次保存整个多文件会话）。
