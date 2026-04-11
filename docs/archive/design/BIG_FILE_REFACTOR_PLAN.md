# OpenMindLearn 超大文件重构方案（V1）

## 1. 目标与范围

### 1.1 背景
当前代码中存在 3 个超过 500 行且职责混杂的核心文件：
- `packages/frontend/src/components/Canvas.tsx`（1238 行）
- `packages/backend/src/services/llm.ts`（847 行）
- `packages/frontend/src/stores/settingsStore.ts`（509 行）

这些文件同时承担 UI 组装、状态编排、协议适配、文本解析、迁移兼容等多类职责，导致改动风险高、回归成本高、阅读与定位成本高。

### 1.2 目标
- 将“单文件多职责”拆分为“按领域职责聚合”的模块。
- 降低核心文件体积，目标：
  - `Canvas.tsx` 降到 `<= 450` 行
  - `llm.ts` 降到 `<= 350` 行（保留外部 facade）
  - `settingsStore.ts` 降到 `<= 300` 行
- 保持外部 API 与用户行为不变（重构优先，不做功能扩展）。

### 1.3 不在本次范围
- 不改 `.oml` 文件格式规范（除非后续另开专题）。
- 不改当前前后端 API 协议字段。
- 不做视觉风格升级与交互改版（仅结构重组）。

---

## 2. 重构原则

- **单一职责**：一个模块只处理一类变化原因。
- **低耦合高内聚**：UI 展示层不承载复杂业务策略；策略下沉到 hooks/services。
- **可回滚**：按阶段提交，每阶段可独立验证与回退。
- **兼容优先**：对外导出与关键调用路径保持稳定，先“搬家”后“优化”。

---

## 3. 目标结构设计

## 3.1 Frontend: Canvas 拆分

当前 `Canvas.tsx` 同时承担：
- 画布容器与 ReactFlow 参数编排
- 区域层渲染与交互热区
- 搜索栏、首节点创建面板
- 右侧详情面板
- Meta/Version 弹窗
- 全局图片粘贴监听

建议拆分为：

```text
packages/frontend/src/components/canvas/
  Canvas.tsx                      # 仅页面编排与状态拼装（Facade）
  CanvasFlow.tsx                  # ReactFlow 主体与基础参数
  CanvasSearchPanel.tsx           # 搜索面板
  CanvasRegionLayer.tsx           # 区域可视层（填充/标题）
  CanvasRegionInteractionLayer.tsx# 区域拖拽/缩放热区
  CanvasRegionPanel.tsx           # 区域管理侧浮层
  CanvasFirstNodePanel.tsx        # 空画布首节点创建面板
  CanvasContextMenu.tsx           # 右键菜单
  NodeDetailPanel.tsx             # 右侧详情（可调宽度）
  MetaEditorDialog.tsx            # 标签与备注弹窗
  VersionDialog.tsx               # 版本历史弹窗
  hooks/
    useDetailPanelResize.ts       # 详情面板宽度拖拽
    useGlobalImagePaste.ts        # 全局粘贴图片逻辑
    useSourceLinkHighlight.ts     # 来源节点/边高亮定时清理
```

拆分后 `Canvas.tsx` 只做：
- 顶层状态组合
- 调用现有业务 hooks（`useCanvasNodes/useCanvasRegions/...`）
- 组装子组件并传递 props

## 3.2 Backend: LLM 服务拆分

当前 `llm.ts` 混合：
- 配置解析/默认值
- Prompt 模板与渲染
- OpenAI/Gemini payload 构造
- 响应解析与 think 抽取启发式
- 请求发送与错误处理

建议拆分为：

```text
packages/backend/src/services/llm/
  index.ts                    # 对外 facade：generateContent / generateWithContext / set/get config
  config.ts                   # runtimeConfig + env 合并 + normalize
  prompts.ts                  # 默认 prompt + buildExpandPrompt + buildContextPrompt
  adapters/
    openaiChat.ts             # OpenAI 风格 payload + 响应归一化
    googleGemini.ts           # Gemini 风格 payload + 响应归一化
  parsing/
    thinkingExtractor.ts      # think/answer 分离（启发式集中管理）
    normalize.ts              # 公共文本抽取工具
  transport.ts                # fetch + parse json + 错误处理
  types.ts                    # 类型集中定义
```

设计要点：
- 将“协议适配”和“业务解析”解耦。
- `thinkingExtractor.ts` 提供纯函数，便于单测覆盖边界文本。
- `index.ts` 保持当前导出函数名，避免调用方改动。

## 3.3 Frontend: settingsStore 拆分

当前 `settingsStore.ts` 混合：
- LLM/UI 状态定义
- 多语言默认 prompts 大段常量
- legacy 升级兼容
- normalization 与 persist merge

建议拆分为：

```text
packages/frontend/src/stores/settings/
  types.ts                    # ThemeMode/ApiStyle/LLMSettings/UISettings
  defaults.ts                 # 默认值与按语言默认 prompt
  legacyUpgrade.ts            # 旧配置迁移策略
  normalize.ts                # normalizeLLMSettings / normalizeUISettings
  store.ts                    # zustand + persist 装配

packages/frontend/src/stores/settingsStore.ts
  # 仅保留兼容出口 re-export（可选）
```

设计要点：
- 将“默认文案资源”与“store 行为”分离。
- 升级兼容逻辑从 store 主体中剥离，降低阅读复杂度。

---

## 4. 分阶段实施计划

## 阶段 A：无行为变更的代码搬迁
- 新建目标目录与文件骨架。
- 把常量/工具函数平移到新文件，不改逻辑。
- 保持所有导出函数签名不变。

验收：
- `pnpm -C packages/frontend build` 通过
- `pnpm -C packages/backend build` 通过

## 阶段 B：Canvas 组件解耦
- 先抽 `NodeDetailPanel`、`MetaEditorDialog`、`VersionDialog`（低耦合，风险小）。
- 再抽 `CanvasRegion*` 三件套（渲染层、交互层、管理面板）。
- 最后抽 `CanvasFirstNodePanel` 与 `CanvasContextMenu`。

验收：
- 关键交互回归：
  - 区域拖拽创建/移动/缩放/改名
  - 锁定模式下区域不可交互
  - 详情面板拖拽宽度、滚动隔离
  - 首节点文本/生成/图片上传与粘贴

## 阶段 C：LLM 服务模块化
- 抽出 `config/prompts/adapters/parsing/transport`。
- 增加 `thinkingExtractor` 样例测试用例（中英文 + 锚点关键词）。
- 校验 `apiStyle=openai_chat/google_gemini` 两条路径等价输出结构。

验收：
- `generateContent/generateWithContext` 对外结果字段不变：`{ content, thinking? }`
- 错误信息格式保持当前可读性

## 阶段 D：settingsStore 模块化
- 抽离 defaults/upgrade/normalize。
- store 仅保留 action 与 persist glue 代码。
- 增加迁移样例（legacy 输入 -> 规范化输出）测试。

验收：
- 本地已有设置可正常读取
- 中英文 prompt 切换与保存行为不变

---

## 5. 风险与应对

- **风险 1：Canvas 拆分导致 props 传递过深**
  - 应对：按功能域定义 `Props`，必要时引入 `CanvasViewModel` 聚合对象，避免几十个离散参数。

- **风险 2：LLM 响应解析边界回归**
  - 应对：为 `thinkingExtractor` 添加固定输入输出用例，先锁定行为再重排代码。

- **风险 3：settings 迁移兼容破坏历史配置**
  - 应对：在 `legacyUpgrade.ts` 保留现有判定规则，先复制后重构，不先“简化规则”。

---

## 6. 验收清单（Definition of Done）

- 超大文件体积达标：
  - `Canvas.tsx <= 450`
  - `llm.ts/index.ts facade <= 350`
  - `settingsStore.ts/store.ts <= 300`
- 类型检查与构建通过（frontend/backend）。
- 关键手工回归场景通过（区域、详情、生成、思考提取、设置读写）。
- 文档更新：在 `docs/IMPLEMENTATION_SUMMARY.md` 增加重构记录与模块地图。

---

## 7. 建议执行顺序（结合当前开发节奏）

1. 先做阶段 A + B（前端收益最大，且你当前迭代集中在 Canvas）。
2. 再做阶段 C（LLM 逻辑稳定后更利于后续模型接入扩展）。
3. 最后做阶段 D（避免设置结构调整影响前两阶段联调）。

该顺序可以在不打断现有功能迭代的前提下，持续降低维护成本。
