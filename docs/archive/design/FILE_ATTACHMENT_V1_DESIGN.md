# OpenMindLearn 文件附件扩展方案（V1）

## 1. 背景与目标

当前项目已支持“图片附件”能力（上传/粘贴、节点展示、`.oml` 保存与加载、图片参与 LLM 请求）。

本方案目标是在此基础上新增“通用文件附件”，并保持实现简单可控：

1. 支持在节点上附加任意文件。
2. 单文件大小上限 `50MB`（前后端双重校验）。
3. UI 仅展示文件名与大小，不做缩略图/预览。
4. 文件可随 `.oml` 保存与加载。
5. 不破坏现有图片附件与已有 `.oml` 文件加载。

## 2. 范围定义

### 2.1 本期（V1）范围

1. 节点内文件附件增删。
2. 首节点面板支持添加文件附件。
3. `.oml` 中持久化 `attachments` 元数据与二进制资源。
4. 加载后恢复附件列表。
5. 超限文件拦截与错误提示。

### 2.2 非本期范围

1. 文件内容解析（如 PDF/Word 抽取文本）。
2. 文件预览（PDF 预览、音视频播放等）。
3. 将文件二进制直接传给 LLM（V1 不做）。

## 3. 设计原则

1. 复用已有图片附件链路（类型、状态、文件打包思路）。
2. 与图片解耦：图片仍走 `images`，文件走 `attachments`，避免影响现有多模态生成逻辑。
3. 优先增量兼容：新增字段尽量可选，旧文件可正常读取。

## 4. 数据模型设计

## 4.1 前后端共享类型

在 `packages/frontend/src/types/index.ts` 与 `packages/backend/src/types/index.ts` 增加：

```ts
export interface NodeAttachment {
  id: string
  base64: string
  mimeType: string
  name: string
  size: number // 原始字节数
}
```

并在 `Node` 上新增可选字段：

```ts
attachments?: NodeAttachment[]
```

说明：
1. `size` 用于 UI 展示和二次校验。
2. `name` 强制存在，便于“只显示文件名”场景。

## 4.2 `.oml` 节点描述结构（node.json）

在现有 `images` 基础上新增：

```json
{
  "attachments": [
    {
      "id": "att-1740000000000-abcd",
      "mimeType": "application/pdf",
      "name": "需求说明.pdf",
      "size": 245760,
      "file": "att-1740000000000-abcd.pdf"
    }
  ]
}
```

## 5. 存储结构设计（`.oml`）

延续当前“节点目录自闭环”策略，建议明确子目录：

```text
nodes/<nodeId>/
  node.json
  current.md
  versions/
  resources/
    images/
      <image-file>
    attachments/
      <attachment-file>
```

说明：
1. 当前代码中图片是 `resources/<image-file>`，V1 可升级为 `resources/images/`。
2. 读取时增加兼容回退：若 `resources/images/<file>` 不存在，则尝试旧路径 `resources/<file>`。
3. 附件统一放 `resources/attachments/`，避免与图片混放。

## 6. 前端改造方案

## 6.1 类型与工具

1. `types/index.ts`：新增 `NodeAttachment`，`Node.attachments`。
2. 新增 `utils/attachment.ts`：
 - `readFilesAsNodeAttachments(files, maxBytes)`
 - `formatFileSize(bytes)`
 - 生成附件 ID（如 `att-${Date.now()}-${rand}`）
 - 超限过滤与错误集合返回。

## 6.2 组件与交互

1. `components/NodeCard.tsx`
 - 编辑态新增“添加文件”按钮（`<input type="file" multiple>`，不限制 `accept`）。
 - 在附件区渲染文件条目：文件名 + 大小 + 删除按钮。
 - 不做预览弹窗。

2. `components/canvas/CanvasFirstNodePanel.tsx`
 - 新增“添加文件”入口。
 - 仅展示已添加文件数或文件名列表。

3. `components/canvas/NodeDetailPanel.tsx`
 - 详情面板可显示附件文件名列表（只读）。

4. `i18n`（`zh-CN.ts` / `en-US.ts`）新增文案：
 - 添加文件、文件数量、删除文件、超限提示等。

## 6.3 状态与流程

1. `hooks/useCanvasNodes.ts`
 - 增加 `handleAttachmentsChange(nodeId, attachments)`。
 - 新建节点/首节点创建时写入 `attachments`。

2. `utils/graphSnapshot.ts` 与 `hooks/useCanvasFileIO.ts`
 - 保存/加载节点快照时透传 `attachments`。

3. 与 LLM 请求关系：
 - `generateNode/expandNode` 仍只传 `images`。
 - 附件在 V1 仅用于知识卡片本地挂载与持久化。

## 7. 后端改造方案

## 7.1 类型与路由

1. `packages/backend/src/types/index.ts`
 - 新增 `NodeAttachment`、`Node.attachments`。

2. `routes/nodes.ts`
 - 本期无需把 `attachments` 传给 LLM，可不改接口协议。

## 7.2 文件服务（核心）

改造 `packages/backend/src/services/fileService.ts`：

1. 新增描述类型：
 - `NodeDescriptorAttachment { id, mimeType, name, size, file }`
 - `NodeDescriptor.attachments?: NodeDescriptorAttachment[]`

2. 保存逻辑 `saveOmlFile`：
 - 图片写入 `nodes/<id>/resources/images/`。
 - 附件写入 `nodes/<id>/resources/attachments/`。
 - `node.json` 写入 `attachments` 元数据。

3. 加载逻辑 `loadOmlFile`：
 - 按 `descriptor.attachments` 回读二进制并组装 `NodeAttachment[]`。
 - 图片读取保留旧路径兼容。

4. 版本号建议：
 - `formatVersion` 可从 `2.0` 升到 `2.1`（同大版本，兼容读取）。

## 8. 50MB 限制策略

## 8.1 前端校验（首层）

1. 读取文件前校验：`file.size <= 50 * 1024 * 1024`。
2. 超限文件跳过，并给出 toast（包含文件名）。

## 8.2 后端校验（兜底）

在 `saveOmlFile` 前对 `node.attachments` 二次校验：

1. 使用 `size` 字段校验。
2. 若缺少 `size`，可由 base64 长度估算字节数进行校验。
3. 超限直接抛错，防止绕过前端写入异常大文件。

实现注意：
1. `50MB` 单文件会显著增加前端 base64 持有内存与 `.oml` 打包耗时，UI 需保留清晰的“处理中”反馈。

## 9. 兼容性与迁移

1. 新版本加载旧 `.oml`：兼容（`attachments` 为空即可）。
2. 新版本保存文件后，旧版本应用可能忽略 `attachments`。
3. 为避免图片路径迁移风险，加载图片时做“双路径回退”：
 - 新路径：`resources/images/<file>`
 - 旧路径：`resources/<file>`

## 10. 实施步骤（建议）

1. 第一步：类型与 `fileService` 改造，先打通保存/加载。
2. 第二步：前端状态链路透传（`useCanvasNodes`、`useCanvasFileIO`、`graphSnapshot`）。
3. 第三步：UI 增加文件上传与列表展示（NodeCard、FirstNode、DetailPanel）。
4. 第四步：补 i18n、超限提示、手工回归。

## 11. 验证清单

1. `pnpm -C packages/frontend build`
2. `pnpm -C packages/backend build`
3. 手工验证：
 - 节点添加 1~N 个小文件后保存/加载，文件名与大小恢复正确。
 - 上传 `>50MB` 文件被拦截，并有错误提示。
 - 现有图片附件行为不回归（上传、预览、保存/加载、参与生成）。
 - 新版本可打开旧 `.oml`。

## 12. 后续演进（V2 可选）

1. 按 MIME 类型做图标展示（PDF/Word/压缩包等）。
2. 支持“将可解析文本文件内容注入上下文”开关。
3. 支持附件下载导出（从节点导出单文件）。
