# OpenMindLearn PRD：Provider 管理与状态统一架构优化（2026-04-14）

## 1. 背景

当前 LLM 配置链路已支持多 Profile、模型列表拉取、运行时同步，但状态来源仍分散，导致用户看到的状态可能互相冲突：

1. 配置页显示“运行时已加载密钥”，但保存时可能提示 `API Key is missing`。
2. 右上角红绿灯、配置页状态、Toast 报错来自不同判定逻辑，存在短时间不一致。
3. Provider 语义目前主要由 `apiStyle + baseURL + modelsPath` 组合推断，缺少统一注册表与能力模型。
4. 模型列表获取与运行时同步在 key 回退策略上存在差异，难以向用户解释“为什么这个能用、那个报错”。

## 2. 目标

1. 建立统一 Provider 管理模型，减少分散分支逻辑。
2. 建立单一状态语义，统一“配置页 / 顶栏 / Toast / 同步流程”判定规则。
3. 将“本地密钥、运行时密钥、环境变量密钥”来源明确化并可观测。
4. 完成接口收敛：仅保留 `/api/config/llm/sync` 与 `/api/config/state` 作为配置状态入口。

## 3. 范围

本期包含：

1. Provider 注册表与能力抽象（前后端各一份，结构对齐）。
2. 配置状态模型重构（从布尔字段转为可解释状态枚举）。
3. 运行时同步接口统一（含返回标准化状态快照）。
4. UI 状态统一与提示文案统一（设置页、右上角、Toast）。

本期不包含：

1. 新增第三方 Provider SDK 依赖。
2. 云端配置同步与多端共享。
3. 复杂凭据体系（如 OAuth、临时令牌刷新）。

## 4. 核心架构设计

### 4.1 领域模型（统一语义）

#### ProviderDefinition

```ts
type ProviderId = 'openai_compatible' | 'anthropic' | 'google_gemini' | 'custom'

interface ProviderDefinition {
  id: ProviderId
  label: string
  supportedApiStyles: ApiStyle[]
  defaultModelsPath: string
  authSchemes: Array<'bearer' | 'x-api-key' | 'x-goog-api-key' | 'anthropic-version'>
  baseUrlRules: {
    supportsV1AutoVariant: boolean
    normalize: (input: string) => string
  }
}
```

#### 配置健康状态（ProfileHealth）

```ts
type SecretAvailability = 'unknown' | 'local' | 'runtime' | 'env' | 'missing' | 'error'
type RuntimeSyncState = 'idle' | 'syncing' | 'synced' | 'stale' | 'failed'
type ReadinessState = 'ready' | 'missing_base_url' | 'missing_model' | 'missing_key' | 'sync_failed'

interface ProfileHealth {
  profileId: string
  providerId: ProviderId
  secretAvailability: SecretAvailability
  runtimeSyncState: RuntimeSyncState
  readiness: ReadinessState
  lastSyncError?: string
  updatedAt: string
}
```

说明：后续 UI 只消费 `ProfileHealth`，不再直接拼接 `hasApiKey + runtimeHasApiKey + 本地读取结果`。

### 4.2 Provider 注册表（前后端对齐）

前端职责：

1. 根据 `providerId/apiStyle/baseURL` 提供用户侧校验提示（例如 modelsPath 默认值、`/v1` 兼容说明）。
2. 生成“获取模型”请求参数，不在组件中写 provider 分支。

后端职责：

1. 基于 ProviderDefinition 生成模型列表请求序列（含带/不带 `/v1` 变体）。
2. 统一鉴权头注入策略。
3. 返回“本次调用实际采用的 provider 解析结果与 key 来源”用于前端显示。

### 4.3 统一状态来源分层

定义四层状态，严格单向派生：

1. `PersistedProfileState`（Zustand 持久化）：profile 基础配置与 secret 元信息。
2. `ResolvedSecretState`（secret 服务）：当前会话可读密钥可用性。
3. `RuntimeSnapshot`（后端返回）：后端真实生效配置与 key 来源。
4. `DerivedProfileHealth`（纯函数派生）：UI 唯一消费状态。

要求：

1. 组件不可自行混用多源布尔值判断“是否可用”。
2. 所有红绿灯、状态文案、保存后反馈统一由 `DerivedProfileHealth` 输出。

### 4.4 同步流程统一（保存 / 切换 / 启动）

#### 保存配置（Settings）

1. 先写本地 profile config。
2. 写入或清理 secret。
3. 调用统一同步接口 `/api/config/llm/sync`（允许显式声明是否允许 runtime fallback）。
4. 使用响应中的 `runtimeSnapshot + health` 回填前端状态。
5. 只在 `health.readiness !== ready` 时给出错误提示。

#### 切换配置（ProfileSwitcher）

1. 调用同一同步接口，不走独立分支。
2. 成功后切 activeProfileId；失败则不切换，并保留当前 runtime。

#### 启动同步（App 初始化）

1. 先拉取 `/api/config/state` 获取当前 runtimeSnapshot。
2. 对 activeProfile 执行轻量 reconcile，必要时后台同步一次。
3. 仅对状态变化触发 Toast，避免重复报错刷屏。

## 5. 接口草案

### 5.1 `POST /api/config/llm/sync`

请求：

```json
{
  "profileId": "profile-xxx",
  "config": {
    "baseURL": "...",
    "model": "...",
    "apiStyle": "openai_chat",
    "modelsPath": "models",
    "temperature": 0.7,
    "maxTokens": 4096
  },
  "apiKey": "optional",
  "allowRuntimeApiKeyFallback": true
}
```

响应：

```json
{
  "success": true,
  "runtimeSnapshot": {
    "hasApiKey": true,
    "keySource": "request | runtime | env | none",
    "providerId": "openai_compatible",
    "baseURL": "...",
    "model": "...",
    "apiStyle": "openai_chat",
    "updatedAt": "2026-04-14T00:00:00.000Z"
  },
  "health": {
    "profileId": "profile-xxx",
    "secretAvailability": "runtime",
    "runtimeSyncState": "synced",
    "readiness": "ready"
  },
  "diagnostics": []
}
```

### 5.2 `GET /api/config/state`

用途：前端启动与页面切换时拉取标准化 runtime 状态，避免仅用 `hasApiKey:boolean`。

## 6. 前端状态改造建议

1. 新增 `profileHealthStore`（或在 settings store 内新增 `healthByProfileId`），只存后端返回的健康状态。
2. 新增 selector：
   - `selectActiveProfileHealth`
   - `selectProfileReadiness(profileId)`
   - `selectToolbarIndicatorState`
3. `SettingsDialog` 与 `ProfileSwitcher` 使用同一 selector，不再各自拼逻辑。
4. Toast 改为“状态机触发”：只在 `syncing -> failed`、`failed -> synced` 等迁移时提示。

## 7. 迁移策略（全量切换）

1. 数据兼容：保留现有 `profiles[].secret.hasApiKey`，作为本地 secret 元信息，不要求用户重配。
2. 接口收敛：
   - 删除旧 `/api/config/llm`。
   - 删除旧 `/api/config/llm/status`。
   - 前端仅允许通过 `/api/config/llm/sync` 与 `/api/config/state` 读写配置状态。
3. 渐进迁移顺序：
   - M1：后端新接口与 ProviderRegistry 落地。
   - M2：前端状态派生统一，UI 切 selector。
   - M3：移除旧接口与旧调用，完成 service 层收口。

## 8. 验收标准

1. 同一时刻设置页、右上角、Toast 对“可用/不可用”判断一致。
2. “获取模型成功但保存报缺 key”冲突消失；若失败，错误原因一致且可解释。
3. 切换 Profile 时，失败不会污染 activeProfile 状态。
4. 刷新页面后状态能正确恢复，不出现“已加载/未加载”闪烁错判。
5. `/v1` 带与不带、`modelsPath` 自定义在各 provider 下行为可预测。

## 9. 风险与注意事项

1. 风险：前后端 ProviderDefinition 不一致会导致行为漂移。  
   约束：定义共享 schema（至少共享 JSON 结构与测试用例）。
2. 风险：状态机引入后若迁移不完整，可能出现双状态源。  
   约束：以 `ProfileHealth` 为唯一 UI 判定源，逐步删除旧判断。
3. 风险：后续改动重新引入旧路径，导致状态入口再次分叉。  
   约束：将 `/api/config/llm/sync` 与 `/api/config/state` 作为唯一白名单接口，并在代码检索/评审中禁止新增旧路径调用。

## 10. 影响模块（实施参考）

前端：

1. `packages/frontend/src/services/profileRuntime.ts`
2. `packages/frontend/src/services/api.ts`
3. `packages/frontend/src/services/secureSecret.ts`
4. `packages/frontend/src/components/SettingsDialog.tsx`
5. `packages/frontend/src/components/ProfileSwitcher.tsx`
6. `packages/frontend/src/stores/settings/*`

后端：

1. `packages/backend/src/routes/nodes.ts`
2. `packages/backend/src/services/llm/config.ts`
3. `packages/backend/src/services/llm/models.ts`
4. `packages/backend/src/services/llm/types.ts`
