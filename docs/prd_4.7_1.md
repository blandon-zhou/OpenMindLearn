# OpenMindLearn 多套 LLM 配置与右上角快速切换 PRD（2026-04-07）

## 1. 背景

当前产品只支持一套全局 LLM 配置（`apiKey/baseURL/model/apiStyle` + 生成参数）。

这会带来三个实际问题：

1. 用户在不同服务商（OpenAI 兼容、Anthropic、OpenAI Responses、Gemini）之间切换时，需要反复覆盖输入。
2. 同一服务商的不同模型（例如低成本模型与高质量模型）无法快速切换。
3. 切换动作只能进入设置弹窗完成，缺少右上角的“快速切换入口”，中断学习流。

## 2. 目标

1. 支持保存多套 LLM 配置方案（Profile）。
2. 支持在界面右上角快速切换当前生效配置。
3. 配置切换后立即作用于后端运行时，不要求重启。
4. 模型字段继续支持“可选可输”（下拉选择 + 手动输入）。
5. API Key 本地加密存储，避免明文落盘。
6. 与现有单配置数据自动兼容迁移，不破坏老用户。

## 3. 非目标

1. 本期不做云端账户级同步（仅本地持久化）。
2. 本期不做团队共享配置。
3. 本期不改动节点生成协议、上下文构建策略。

## 4. 方案总览

新增“LLM Profile”概念：

1. 每个 Profile 存一套可直接调用后端的模型运行配置。
2. 全局只保留一个 `activeProfileId` 表示当前生效方案。
3. 设置弹窗负责“管理配置”；工具栏右上角负责“快速切换配置”。
4. API Key 不进入持久化明文 Store，通过安全存储层读写。
5. 切换 Profile 时，前端从安全存储读取 key，再调用 `/api/config/llm` 同步到后端运行时。

## 5. 数据模型设计

### 5.1 前端 Store 结构（核心）

在 `llmSettings` 下新增：

```ts
interface LLMProfile {
  id: string
  name: string
  config: {
    baseURL: string
    model: string
    apiStyle: 'openai_chat' | 'openai_response' | 'anthropic' | 'google_gemini'
    temperature: number
    maxTokens: number
    contextMaxDepth: number
  }
  secret: {
    provider: 'os_keychain' | 'webcrypto'
    secretId: string
    hasApiKey: boolean
    updatedAt?: string
  }
  modelOptionsCache?: string[]
  updatedAt: string
}

interface LLMSettings {
  activeProfileId: string
  profiles: LLMProfile[]

  // 保持现有 prompt 配置为项目级（不随 profile 切换）
  promptLocale: LocaleCode
  localizedPrompts: Record<LocaleCode, LocalizedPromptConfig>
  answerAnchorKeywords: string[]
  systemPrompt: string
  promptTemplates: PromptTemplates
}
```

### 5.2 设计取舍

1. Profile 只承载“模型连接与采样参数 + 密钥引用元数据”。
2. Prompt 模板保持项目级，避免切换模型时把提示词也一起改掉，降低认知负担。
3. `modelOptionsCache` 按 Profile 缓存，避免每次切换都重新拉取模型列表。
4. `apiKey` 仅允许存在于内存态编辑变量，不写入 `oml-settings` 持久化。

### 5.3 安全存储抽象

新增统一接口（前端调用）：

```ts
interface SecureSecretStore {
  set(secretId: string, plaintext: string): Promise<void>
  get(secretId: string): Promise<string | null>
  remove(secretId: string): Promise<void>
}
```

实现策略：

1. 桌面端（Electron）：使用系统钥匙串（建议 `keytar`），主进程持有读写能力，通过 `preload` 暴露受限 IPC。
2. 浏览器端：使用 `WebCrypto(AES-GCM)` 加密后再落地 localStorage。加密密钥来源为用户主密码（PBKDF2 派生）。
3. 浏览器端若用户未设置主密码：API Key 仅会话内存保存，关闭页面后失效，不落盘。

## 6. 交互设计

### 6.1 设置弹窗（管理配置）

在 LLM 设置页新增“配置方案管理区”：

1. Profile 下拉（显示名称 + 当前标记）。
2. 新建方案（从当前方案复制）。
3. 重命名方案。
4. 删除方案（至少保留 1 套）。
5. 设为默认（可选，等同切换为 active）。

编辑区行为：

1. 当前编辑内容绑定“选中 Profile”。
2. API Key 输入框支持“显示已保存状态/更新密钥/清除密钥”。
3. 点击“保存”时，先写入安全存储，再保存该 Profile 元数据 + 项目级 Prompt 设置。
4. 若保存的是 active Profile，同步调用后端更新运行时。

### 6.2 工具栏右上角（快速切换）

在 `Toolbar` 右侧新增 `ProfileSwitcher`（位于设置按钮左侧）：

1. 按钮文案：`LLM: <profileName>`。
2. 点击弹出可搜索列表（支持名称、`model` 关键字过滤）。
3. 列表项展示：`profileName`、`apiStyle`、`model`。
4. 选中即切换（不需要再进设置弹窗）。
5. 切换中显示 loading 状态，防止重复点击。

### 6.3 切换执行逻辑

1. 用户在右上角选择 Profile B。
2. 前端从安全存储读取 B 的 `apiKey`。
3. 前端发起 `/api/config/llm`，携带 B 的 `config` + `apiKey` + 当前项目级 Prompt 配置。
4. 成功：`activeProfileId = B`，toast 提示“已切换到 B”。
5. 失败：保留原 active，toast 显示错误原因。

## 7. 模型选择器（延续现有能力）

在每个 Profile 的 model 字段继续使用“可搜可输”组合输入：

1. 用户可从模型列表选择。
2. 也可手动输入自定义模型名。
3. 模型拉取来源仍是 `/api/config/models`，参数来自当前 Profile 的 `baseURL/apiStyle` + 安全存储中读取的 `apiKey`。
4. 拉取到的模型列表写入该 Profile 的 `modelOptionsCache`。

## 8. 兼容迁移

### 8.1 老数据升级

检测到旧结构（单套 `apiKey/baseURL/model/...`）时自动迁移：

1. 生成 `profiles[0]`，命名为“默认配置”。
2. 将旧 `apiKey` 写入安全存储，得到 `secretId`。
3. 将旧字段值写入 `profiles[0].config`（不含 apiKey）与 `profiles[0].secret`。
4. `activeProfileId = profiles[0].id`。
5. Prompt 相关字段原样保留。
6. 清理旧持久化结构中的明文 `apiKey` 字段。

### 8.2 回滚策略

若新结构解析失败：

1. 回退到默认空 Profile。
2. 保留 Prompt 默认值。
3. UI 给出“配置已重置”的错误提示。

### 8.3 迁移失败兜底

1. 若安全存储不可用（例如浏览器无主密码、桌面端钥匙串写入失败），提示用户重新输入 API Key。
2. 在故障恢复前，key 仅保留会话内存，不写本地持久层。

## 9. 接口与模块变更

### 9.1 前端

1. `stores/settings/types.ts`
 - 新增 `LLMProfile`、`activeProfileId`、`profiles`、`secret` 元数据。
2. `stores/settings/normalize.ts`
 - 增加旧数据迁移逻辑。
3. `stores/settings/store.ts`
 - 新增 Profile 管理 action（create/rename/delete/switch/updateProfileConfig）。
4. `components/SettingsDialog.tsx`
 - 增加 Profile 管理 UI、密钥状态 UI 与编辑绑定。
5. `components/Toolbar.tsx`
 - 接入 `ProfileSwitcher` 快切入口。
6. `services/secureSecret.ts`（新增）
 - 封装 `secureStore.get/set/remove` 调用。
7. `services/api.ts`
 - 复用现有 `/api/config/llm`、`/api/config/models`；无需新增接口。

### 9.2 后端

本期无需新增后端存储接口，沿用运行时配置更新：

1. `/api/config/llm` 接收当前 active Profile 配置并生效。
2. `/api/config/models` 按 active/编辑中 Profile 参数拉取模型列表。

### 9.3 桌面壳（Electron）

1. `packages/desktop/src/main.cjs`
 - 新增 `oml:secret:get/set/remove` IPC（仅允许按 `secretId` 访问）。
2. `packages/desktop/src/preload.cjs`
 - 暴露 `secureSecret` 受限能力给前端。
3. `packages/desktop/package.json`
 - 新增系统钥匙串依赖（建议 `keytar`）。

## 10. 异常与边界

1. 删除 active Profile：自动切换到剩余第一项并同步后端。
2. 只剩 1 个 Profile 时禁止删除。
3. Profile 重名允许，但 UI 建议提醒“名称重复”。
4. 快速切换时后端不可达：前端不得更新 active 状态。
5. Profile 缺少必填（`baseURL/model`）或无可用密钥时，切换前阻断并提示。
6. 用户清除密钥后，该 Profile 进入“未就绪”状态，直到重新输入 key。

## 11. 验收标准

1. 用户可创建、重命名、删除（保底 1 个）多个 LLM Profile。
2. 刷新页面后 Profile 与 active 状态仍存在。
3. 右上角可在 1 次点击路径内完成切换并即时生效。
4. 切换失败会回滚到旧 active，并给出错误 toast。
5. 模型字段支持“选择 + 输入”，且每个 Profile 拥有独立模型缓存。
6. 老版本单配置用户首次打开后可自动升级且不丢失原配置。
7. `oml-settings` 与相关本地持久化内容中不可出现明文 API Key。
8. 桌面端密钥可在应用重启后自动读取（来自系统钥匙串）；浏览器端可通过主密码解密恢复。

## 12. 里程碑建议

### M1（数据层）

1. Store 类型与 normalize 迁移完成。
2. Action 能完整支持 CRUD + switch。
3. 明文 API Key 迁移与清理逻辑完成。

### M2（设置页）

1. SettingsDialog 完成 Profile 管理区。
2. 保存逻辑改为“先写安全存储，再写 Profile 元数据 + 项目 Prompt”。

### M3（工具栏快切）

1. Toolbar 集成 ProfileSwitcher。
2. 切换流程接通“安全存储读取 -> 后端同步 -> 状态提交/回滚”。

### M4（联调与验收）

1. 前后端 build 通过。
2. 手测覆盖 4 类 API 风格 + 模型拉取。
3. 验收标准逐条通过。

## 13. 风险与后续

1. 浏览器端风险：若用户不设置主密码，只能走会话内存模式，重启后需重新输入 key。
2. 可扩展风险：Profile 数量很大时，设置页管理需要分页/分组（本期先不做）。
3. 后续可选增强：
 - Profile 导入导出（仅导出不含密钥，或单独加密导出密钥包）
 - 按场景自动切换（例如 Chat 模式默认低成本模型）
 - Profile 健康检查（连通性/限流/余额提示）
 - 密钥轮换提醒与过期检测
