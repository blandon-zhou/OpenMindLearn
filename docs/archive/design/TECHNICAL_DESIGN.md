# OpenMindLearn 技术设计文档

## 文档概述

本文档描述 OpenMindLearn 项目的技术架构、模块设计和关键实现方案，不包含具体代码实现细节。

---

## 技术栈选型

### 前端技术栈
- **框架**：React 18+ + TypeScript
- **构建工具**：Vite
- **画布引擎**：React Flow（节点拖拽、连接线、区域标注）
- **UI 组件库**：shadcn/ui（基于 Radix UI + Tailwind CSS）
- **状态管理**：Zustand
- **Markdown 渲染**：react-markdown + remark-gfm
- **代码高亮**：Prism.js / highlight.js
- **文件处理**：JSZip（浏览器端 ZIP 操作）
- **Diff 对比**：react-diff-viewer

### 后端技术栈
- **运行时**：Node.js 20+
- **语言**：TypeScript
- **框架**：Fastify（高性能、类型安全）
- **LLM SDK**：
  - `@google/generative-ai`（Gemini）
  - `openai`（OpenAI）
  - `@anthropic-ai/sdk`（Claude）
- **Agent 框架**：LangGraph.js（未来扩展）
- **文件处理**：
  - `jszip`（ZIP 压缩/解压）
  - `xml2js`（XML 解析/生成）
  - `fs-extra`（文件系统操作）

### 桌面应用打包
- **方案选择**：Tauri（优先）或 Electron
  - Tauri：更轻量，Rust 后端，安全性高
  - Electron：生态成熟，但体积较大
- **目标平台**：macOS（优先）→ Windows → Linux

### 部署方案
- **容器化**：Docker + Docker Compose
- **前端服务**：Nginx（生产环境）/ Vite Dev Server（开发环境）
- **后端服务**：Node.js + Fastify

---

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                     用户界面层                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  画布视图     │  │  节点编辑器   │  │  设置面板     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   前端应用层 (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  状态管理     │  │  画布引擎     │  │  文件管理     │  │
│  │  (Zustand)   │  │ (React Flow) │  │  (JSZip)     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP/WebSocket
┌─────────────────────────────────────────────────────────┐
│                   后端服务层 (Fastify)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  API 路由     │  │  LLM 服务     │  │  文件服务     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   数据存储层                              │
│  ┌──────────────┐  ┌──────────────┐                     │
│  │  .oml 文件    │  │  配置文件     │                     │
│  │  (ZIP)       │  │  (JSON)      │                     │
│  └──────────────┘  └──────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

---

## 核心模块设计

### 1. 前端模块

#### 1.1 画布管理模块 (Canvas Manager)

**职责**：
- 管理知识图谱的可视化展示
- 处理节点拖拽、连接线绘制
- 支持区域标注（类似 UE 蓝图）

**关键功能**：
- 节点渲染：卡片式布局，支持 Markdown 内容渲染
- 连接线管理：记录节点之间的父子关系
- 区域标注：可选颜色、可编辑名称、框选多个节点
- 缩放与平移：画布导航

**技术实现**：
- 使用 React Flow 作为画布引擎
- 自定义节点组件（CustomNode）
- 自定义边组件（CustomEdge）
- 区域标注使用 React Flow 的 Group Node 功能

#### 1.2 节点管理模块 (Node Manager)

**职责**：
- 节点的 CRUD 操作
- 节点内容的 Markdown 渲染
- 节点版本控制（最多 3 个版本）

**数据结构**：
```typescript
interface Node {
  id: string
  content: string  // Markdown 格式
  position: { x: number, y: number }
  tags: string[]
  notes: string
  createdAt: string
  updatedAt: string
  versions: NodeVersion[]  // 最多 3 个
  parentIds: string[]  // 父节点 ID 列表
}

interface NodeVersion {
  content: string
  timestamp: string
}
```

**关键功能**：
- 创建节点：粘贴文本 / 基于 prompt 生成
- 编辑节点：Markdown 编辑器
- 版本管理：保存、查看、对比、恢复
- 标签与备注：添加、编辑、删除

#### 1.3 上下文管理模块 (Context Manager)

**职责**：
- 管理节点之间的链式关系
- 构建上下文传递链
- 提供上下文选择 UI

**关键功能**：
- 链式关系追踪：A → B → C → D
- 上下文构建：回溯最多 10 个节点（可配置）
- 上下文选择面板：滚动列表，勾选状态
- XML 格式化：将上下文格式化为 XML

**上下文 XML 格式示例**：
```xml
<context>
  <node id="A">
    <content>节点 A 的内容</content>
    <question>用户对 A 的提问</question>
  </node>
  <node id="B">
    <content>节点 B 的内容</content>
    <question>用户对 B 的提问</question>
  </node>
</context>
```

#### 1.4 文本划线与扩展模块 (Text Selection & Expansion)

**职责**：
- 处理文本划线选择
- 弹出扩展操作框
- 调用 LLM 生成新节点

**交互流程**：
1. 用户在节点中划线选中文本
2. 弹出操作框，显示"直接展开"和"针对性提问"按钮
3. 用户选择操作方式
4. 调用后端 API 生成新节点
5. 在画布上创建新节点并连接

#### 1.5 文件管理模块 (File Manager)

**职责**：
- `.oml` 文件的导入导出
- 文件结构的打包与解包

**文件结构**：
```
knowledge_graph.oml (ZIP)
├── structure.xml          # 图谱元数据
├── nodes/
│   ├── node_001.md
│   ├── node_002.md
│   └── ...
└── resources/
    ├── images/
    └── attachments/
```

**structure.xml 结构**：
```xml
<graph>
  <metadata>
    <name>知识图谱名称</name>
    <createdAt>2026-03-23T10:00:00Z</createdAt>
  </metadata>
  <nodes>
    <node id="node_001" x="100" y="200">
      <tags>
        <tag>重要</tag>
      </tags>
      <notes>备注内容</notes>
      <parents>
        <parent>node_000</parent>
      </parents>
    </node>
  </nodes>
  <regions>
    <region id="region_001" color="#FF6B6B">
      <name>核心概念</name>
      <nodes>
        <node>node_001</node>
        <node>node_002</node>
      </nodes>
    </region>
  </regions>
</graph>
```

#### 1.6 搜索模块 (Search Module)

**职责**：
- 全文搜索节点内容
- 按标签、备注搜索

**实现方案**：
- 前端内存搜索（数据量不大）
- 使用 Fuse.js 实现模糊搜索
- 支持搜索结果高亮

---

### 2. 后端模块

#### 2.1 API 路由模块 (API Routes)

**核心路由**：
- `POST /api/nodes/generate`：基于 prompt 生成节点内容
- `POST /api/nodes/expand`：基于划线文本扩展节点
- `POST /api/files/save`：保存 `.oml` 文件
- `POST /api/files/load`：加载 `.oml` 文件
- `GET /api/config`：获取 LLM 配置
- `PUT /api/config`：更新 LLM 配置

#### 2.2 LLM 服务模块 (LLM Service)

**职责**：
- 封装不同 LLM 提供商的 API 调用
- 支持自定义 Base URL
- 处理流式响应（SSE）

**配置结构**：
```typescript
interface LLMConfig {
  provider: 'gemini' | 'openai' | 'claude' | 'custom'
  baseURL?: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}
```

**关键功能**：
- 统一接口：不同提供商使用统一的调用接口
- 上下文注入：将 XML 格式的上下文注入到 prompt
- 流式输出：支持 SSE 实时返回生成内容
- 错误处理：API 调用失败的重试和降级

#### 2.3 文件服务模块 (File Service)

**职责**：
- `.oml` 文件的读写
- ZIP 压缩与解压
- XML 解析与生成

**关键功能**：
- 保存图谱：将内存中的图谱数据打包为 `.oml` 文件
- 加载图谱：解压 `.oml` 文件并解析为内存数据
- 导出节点：将单个节点导出为 `.md` 文件

#### 2.4 Agent 服务模块 (Agent Service) - 未来扩展

**职责**：
- 使用 LangGraph.js 构建 Agent 工作流
- 支持更复杂的知识生成策略

**可能的 Agent 场景**：
- 多步推理：将复杂问题分解为多个子问题
- 知识检索：结合外部知识库（Wikipedia、文档站点）
- 内容优化：自动优化生成内容的结构和可读性

---

## 数据流设计

### 节点扩展流程

```
用户划线选中文本
    ↓
前端：弹出操作框
    ↓
用户选择"直接展开"或"针对性提问"
    ↓
前端：构建上下文（XML 格式）
    ↓
前端：调用 POST /api/nodes/expand
    ↓
后端：接收请求，提取上下文和选中文本
    ↓
后端：调用 LLM API 生成内容
    ↓
后端：返回生成的内容（SSE 流式）
    ↓
前端：创建新节点，建立连接关系
    ↓
前端：在画布上渲染新节点
```

### 文件保存流程

```
用户点击"保存"
    ↓
前端：收集所有节点数据、连接关系、区域标注
    ↓
前端：生成 structure.xml
    ↓
前端：将节点内容保存为独立的 .md 文件
    ↓
前端：使用 JSZip 打包为 .oml 文件
    ↓
前端：触发浏览器下载 / 调用后端保存到本地
```

---

## 关键技术实现

### 1. 上下文传递机制

**链式关系存储**：
- 每个节点记录其父节点 ID 列表
- 使用图遍历算法回溯上下文链

**上下文构建算法**：
1. 从当前节点开始
2. 递归查找父节点，最多回溯 10 层
3. 收集每个节点的内容和用户提问
4. 格式化为 XML 结构

**上下文选择 UI**：
- 展示当前节点的所有祖先节点
- 用户可以勾选/取消特定节点
- 支持多分支场景（一个节点有多个父节点）

### 2. 版本控制机制

**版本存储**：
- 每个节点最多保存 3 个历史版本
- 超过 3 个时，删除最旧的版本
- 版本包含：内容快照 + 时间戳

**版本对比**：
- 使用 Diff 算法（Myers Diff）
- 展示增删改的行
- 支持并排对比和内联对比

### 3. 区域标注实现

**技术方案**：
- 使用 React Flow 的 Group Node 功能
- 区域作为特殊的节点类型
- 支持拖拽调整大小

**数据结构**：
```typescript
interface Region {
  id: string
  name: string
  color: string
  nodeIds: string[]  // 包含的节点 ID
  position: { x: number, y: number }
  size: { width: number, height: number }
}
```

### 4. Markdown 渲染

**渲染库**：react-markdown + remark-gfm

**支持的特性**：
- 标题、列表、引用
- 代码块（带语法高亮）
- 表格
- 图片（存储在 resources/ 目录）
- 链接

### 5. 搜索实现

**搜索引擎**：Fuse.js（模糊搜索）

**搜索范围**：
- 节点内容（Markdown 文本）
- 节点标签
- 节点备注

**搜索结果**：
- 高亮匹配的文本
- 显示节点预览
- 点击跳转到对应节点

---

## 部署方案

### Docker 部署

**目录结构**：
```
openmindlearn/
├── docker-compose.yml
├── frontend/
│   ├── Dockerfile
│   └── nginx.conf
├── backend/
│   ├── Dockerfile
│   └── src/
└── .env.example
```

**docker-compose.yml 配置**：
- 前端服务：Nginx + React 构建产物
- 后端服务：Node.js + Fastify
- Volume 挂载：用户数据目录

**环境变量**：
- `LLM_PROVIDER`：LLM 提供商
- `LLM_API_KEY`：API Key
- `LLM_BASE_URL`：自定义 Base URL（可选）
- `LLM_MODEL`：模型名称

### macOS 桌面应用

**打包方案**：Tauri

**优势**：
- 体积小（~10MB）
- 性能好（Rust 后端）
- 安全性高（沙箱隔离）

**打包流程**：
1. 前端构建：`npm run build`
2. Tauri 打包：`npm run tauri build`
3. 生成 `.dmg` 安装包

**本地数据存储**：
- macOS：`~/Library/Application Support/OpenMindLearn/`
- 配置文件：`config.json`
- 知识图谱：`graphs/`

---

## 性能优化

### 前端优化
- **虚拟化渲染**：大量节点时使用虚拟滚动
- **懒加载**：节点内容按需加载
- **防抖与节流**：搜索、拖拽等操作
- **Web Worker**：文件解压、搜索等耗时操作

### 后端优化
- **流式响应**：LLM 生成内容使用 SSE 流式返回
- **缓存机制**：缓存常用的 LLM 响应（可选）
- **并发控制**：限制同时进行的 LLM 请求数量

---

## 安全性考虑

### API Key 安全
- 前端不存储 API Key
- 后端加密存储配置文件
- 使用环境变量传递敏感信息

### 文件安全
- 限制上传文件大小
- 验证 `.oml` 文件格式
- 防止路径遍历攻击

### XSS 防护
- Markdown 渲染时过滤危险标签
- 使用 DOMPurify 清理用户输入

---

## 开发计划

### Phase 0：本地开发环境（最优先）
**目标**：快速搭建可调试的开发环境

- pnpm workspace monorepo 结构
- 前端：React + Vite + TypeScript
- 后端：Node.js + Fastify + TypeScript
- 本地开发模式：`pnpm dev` 同时启动前后端
- 热重载支持
- 核心功能快速迭代

**优势**：
- 开发调试最快
- 代码修改即时生效
- 便于测试和验证
- 为后续打包奠定基础

### Phase 1：核心功能实现
**目标**：基于本地开发环境实现 MVP 功能

- 节点创建与展示（React Flow）
- 文本划线与扩展
- 基础 LLM 集成（Gemini，支持自定义 Base URL）
- `.oml` 文件保存与加载
- 上下文传递

### Phase 2：增强功能
**目标**：完善用户体验

- 版本控制（最多 3 个版本）
- 搜索功能（内容 + 标签 + 备注）
- 标签与备注
- Markdown 渲染优化
- 区域标注

### Phase 3：macOS 桌面应用打包
**目标**：将本地开发版本打包为独立应用

- Tauri 集成（基于现有代码）
- macOS 应用打包（.dmg）
- 本地文件系统集成
- 应用图标和签名

**优势**：
- 前端后端代码已完成，只需打包
- Tauri 配置相对简单
- 可以复用所有开发阶段的代码

### Phase 4：Docker 部署版本
**目标**：支持云部署和跨平台 Web 访问

- Docker Compose 配置
- 前端 Nginx 部署
- 后端 API 服务
- 环境变量配置

**优势**：
- 代码已完成，只需容器化
- 配置 Dockerfile 和 docker-compose.yml
- 复用所有业务逻辑

### Phase 5：未来扩展
- LangGraph.js Agent 集成
- 多 LLM 支持（OpenAI、Claude）
- Windows / Linux 桌面应用
- 协作功能（多用户）

---

## 开源协议

**MIT License**

允许任何人自由使用、修改、分发本项目，包括商业用途。
