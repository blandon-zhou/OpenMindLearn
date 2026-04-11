# OpenMindLearn 多语言支持设计（v1）

## 1. 目标与范围

### 1.1 目标
- 在不破坏现有功能的前提下，为项目引入可持续扩展的多语言架构。
- 第一阶段默认提供两种语言：`zh-CN`（简体中文）和 `en-US`（英文）。
- 实现“界面文案 + 提示词模板 + 配置项说明”的语言切换一致性。

### 1.2 本阶段范围
- 前端所有用户可见文案国际化：按钮、弹窗、标题、占位符、Toast、错误提示。
- 设置页增加语言配置，并支持“跟随系统/手动选择”。
- LLM 默认提示词支持中英文两套预设。
- 语言偏好仅在本地设置中保存，不写入 `.oml`。

### 1.3 非目标（本阶段不做）
- 不自动翻译节点正文、问题、备注、标签等用户内容。
- 不做第三语言接入（先把中英文路径跑通）。
- 不做在线翻译服务依赖。
- 不在 `.oml` 中记录 UI 语言或提示词语言。

---

## 2. 设计原则

- **无侵入迁移**：优先改文案来源，不重构业务流程。
- **类型安全**：翻译 key 在编译期可检查，避免运行期缺 key。
- **回退明确**：缺失翻译时按 `当前语言 -> zh-CN -> key` 回退。
- **用户数据原样保留**：节点内容不因 UI 语言切换发生变更。

---

## 3. 语言模型与配置模型

### 3.1 语言枚举

```ts
export type LocaleCode = 'zh-CN' | 'en-US'
export type LocaleMode = 'auto' | LocaleCode
```

### 3.2 前端设置模型（建议）

```ts
interface UISettings {
  theme: 'light' | 'dark'
  localeMode: LocaleMode      // auto / zh-CN / en-US
  localeResolved: LocaleCode  // 解析后的最终语言
}
```

解析规则：
1. `localeMode = zh-CN|en-US` 时直接使用。
2. `localeMode = auto` 时读取浏览器语言：`zh* -> zh-CN`，其余 -> `en-US`。

### 3.3 提示词配置模型（建议）

当前 `systemPrompt + promptTemplates` 为单份文本，建议升级为“按语言存储”：

```ts
interface LLMSettings {
  // ...已有字段
  promptLocale: LocaleCode
  systemPromptByLocale: Record<LocaleCode, string>
  promptTemplatesByLocale: Record<LocaleCode, PromptTemplates>
  answerAnchorKeywordsByLocale: Record<LocaleCode, string[]>
}
```

说明：
- `promptLocale` 控制当前生成时使用哪套提示词。
- 中英文默认预置分别维护，用户可分别覆盖。
- 锚点关键词默认建议：
  - `zh-CN`: `['结论']`
  - `en-US`: `['Conclusion', 'Final Answer']`

---

## 4. 前端架构设计

### 4.1 新增 i18n 模块

建议目录：

```
packages/frontend/src/i18n/
  index.ts
  locales/
    zh-CN.ts
    en-US.ts
  keys.ts
```

核心能力：
- `t(key, params?)`：翻译与变量替换。
- `hasKey(locale, key)`：诊断缺失 key。
- 开发模式下缺 key 发出 `console.warn`。

### 4.2 文案组织方式

按功能域分组，避免扁平 key 失控：

```ts
{
  common: { save: '保存', cancel: '取消' },
  toolbar: { learningMode: '学习模式', viewMode: '查看模式' },
  node: { directExpand: '直接展开', targetedQuestion: '针对性提问' },
  settings: { title: '设置', llmTab: 'LLM 配置' },
  toast: { saveSuccess: '文件保存成功！' },
  error: { loadFailed: '加载失败，请检查文件格式' }
}
```

### 4.3 接入点

- `SettingsDialog`：新增语言选择（放在“外观”页或新增“通用”页）。
- `Toolbar`、`Canvas`、`NodeCard`、`ContextPanel`、`ImageLightbox`、各 hooks 中的 Toast 全部改 `t(...)`。
- 首屏初始化时先计算 `localeResolved`，再渲染 UI，避免闪烁。

---

## 5. 后端与提示词策略

### 5.1 后端职责

后端不负责 UI 文案翻译，但负责：
- 按 `promptLocale` 读取对应默认提示词。
- 合并“用户覆盖模板 + 默认模板”后生成最终请求。
- 回传内容保持原样，不做语言转换。

### 5.2 提示词默认值管理

建议将默认提示词从 `settingsStore.ts` 拆到共享配置文件：

```
packages/shared/prompts/
  zh-CN.ts
  en-US.ts
```

若暂不引入 shared 包，也可先前后端各自维护同名结构，并在文档中固定字段。

---

## 6. 本地持久化设计

### 6.1 存储目标

语言设置属于软件运行偏好，不属于图谱内容；应保存在本地设置（如 `zustand persist`）而非 `.oml`。

### 6.2 建议字段（本地设置）

建议持久化到 `oml-settings`：

```json
{
  "uiSettings": {
    "localeMode": "auto",
    "localeResolved": "zh-CN"
  },
  "llmSettings": {
    "promptLocale": "zh-CN"
  }
}
```

说明：
- `localeMode`：用户语言策略（auto / zh-CN / en-US）。
- `localeResolved`：最近一次解析结果，用于启动时快速恢复。
- `promptLocale`：当前软件默认使用的提示词语言。
- 打开任何 `.oml` 文件都不应覆盖上述本地语言设置。

---

## 7. 迁移方案

### Phase 1：基础设施
- 建立 `i18n` 模块与中英文语言包。
- `settingsStore` 增加 locale 字段。
- 设置页可切换语言并持久化。

### Phase 2：前端文案替换
- 将所有硬编码中文文案替换为 `t(key)`。
- 覆盖组件文案、placeholder、按钮、toast、错误提示。

### Phase 3：提示词多语言
- 默认提示词改为按语言存储。
- 设置页支持切换并编辑当前语言的提示词。
- 锚点关键词按语言分组保存。

### Phase 4：文件格式与导入导出
- 校验 `.oml` 导入导出流程不受语言切换影响。
- 确保打开不同 `.oml` 不会改写当前软件语言。

---

## 8. 验收标准

- 切换 `zh-CN/en-US` 后，界面文案可即时切换且无残留中文硬编码。
- `localeMode=auto` 时，浏览器语言为中文显示中文，否则显示英文。
- 重启应用后，语言偏好与提示词语言可从本地设置恢复。
- 打开任意 `.oml` 不会改变当前软件语言。
- 中英文提示词可独立编辑，互不覆盖。
- 缺失翻译 key 不导致崩溃，回退链路正确。

---

## 9. 风险与控制

- **风险**：文案 key 数量增长导致管理混乱。  
  **控制**：按域分文件，建立 key 命名规范与 lint 检查。

- **风险**：中英文默认提示词行为不一致。  
  **控制**：同一结构模板，只替换语言，不改策略层级。

- **风险**：历史配置迁移丢失用户自定义 prompt。  
  **控制**：迁移时将旧单份 prompt 写入当前 `promptLocale` 对应槽位。

- **风险**：打开图谱时意外覆盖本地语言设置。  
  **控制**：导入流程显式忽略任何图谱内语言字段（即使未来出现）。

---

## 10. 建议落地顺序（最小可用）

1. 完成 UI 文案国际化与设置切换。
2. 接入提示词双语预设与按语言编辑。
3. 完成本地语言设置持久化与启动恢复。
4. 做一次回归：新建图、导出、导入、再生成节点。
