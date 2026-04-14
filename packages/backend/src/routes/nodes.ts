import { FastifyInstance } from 'fastify'
import {
  buildExpandPrompt,
  createProfileHealth,
  createRuntimeSnapshot,
  generateContent,
  generateWithContext,
  getLLMConfig,
  getProviderDefinitionByApiStyle,
  listAvailableModels,
  resolveRuntimeApiKeySource,
  setLLMConfig,
  type ApiStyle,
  type RuntimeSyncState
} from '../services/llm.js'
import { buildContextChain, generateContextXml } from '../services/contextService.js'
import { Node, SourceReference, NodeImage } from '../types/index.js'

export async function nodeRoutes(fastify: FastifyInstance) {
  fastify.post('/api/nodes/generate', async (request, reply) => {
    try {
      const { prompt, images } = request.body as { prompt: string; images?: NodeImage[] }
      const result = await generateContent(prompt, images)
      return { id: Date.now().toString(), content: result.content, thinking: result.thinking }
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败'
      return reply.code(400).send({ error: message })
    }
  })

  fastify.post('/api/nodes/expand', async (request, reply) => {
    try {
      const { text, parentId, allNodes, selectedNodeIds, sourceRef, expandMode, contextMaxDepth, images } = request.body as {
        text: string
        parentId: string
        allNodes?: Node[]
        selectedNodeIds?: string[]
        sourceRef?: SourceReference
        expandMode?: 'direct' | 'targeted'
        contextMaxDepth?: number
        images?: NodeImage[]
      }

      let result: { content: string; thinking?: string }
      const resolvedDepth = Math.max(1, Math.min(50, Number.isFinite(contextMaxDepth)
        ? Number(contextMaxDepth)
        : getLLMConfig().contextMaxDepth))
      const finalPrompt = buildExpandPrompt(text, expandMode || 'direct')

      // 如果提供了 allNodes，则使用上下文
      if (allNodes && allNodes.length > 0) {
        let contextNodes: Node[]

        // 如果提供了 selectedNodeIds，使用手动选择的节点
        if (selectedNodeIds && selectedNodeIds.length > 0) {
          const nodeMap = new Map(allNodes.map((node) => [node.id, node]))
          contextNodes = selectedNodeIds
            .map((id) => nodeMap.get(id))
            .filter((node): node is Node => Boolean(node))
        } else {
          // 否则自动回溯父节点链（根据配置深度）
          contextNodes = buildContextChain(parentId, allNodes, resolvedDepth)
        }

        // 生成 XML 格式上下文
        const contextXml = generateContextXml(contextNodes)

        // 使用带上下文的生成
        result = await generateWithContext(finalPrompt, contextXml, images)
      } else {
        // 没有上下文，直接生成
        result = await generateContent(finalPrompt, images)
      }

      return {
        id: Date.now().toString(),
        content: result.content,
        thinking: result.thinking,
        question: text,
        parentId,
        sourceRef
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '扩展失败'
      return reply.code(400).send({ error: message })
    }
  })

  interface SyncRequestConfig {
    baseURL?: string
    model?: string
    apiStyle?: ApiStyle
    answerAnchorKeywords?: string[]
    temperature?: number
    maxTokens?: number
    contextMaxDepth?: number
    systemPrompt?: string
    promptTemplates?: {
      directExpand?: string
      targetedQuestion?: string
      contextEnvelope?: string
    }
  }

  interface SyncRequestBody {
    profileId?: string
    config?: SyncRequestConfig
    apiKey?: string
    allowRuntimeApiKeyFallback?: boolean
  }

  function syncRuntimeConfig(payload: SyncRequestBody) {
    const profileId = (payload.profileId || 'active-profile').trim() || 'active-profile'
    const config = payload.config || {}
    const allowRuntimeApiKeyFallback = Boolean(payload.allowRuntimeApiKeyFallback)
    const requestApiKey = payload.apiKey?.trim() || ''

    const nextConfig: {
      apiKey?: string
      baseURL?: string
      model?: string
      apiStyle?: ApiStyle
      answerAnchorKeywords?: string[]
      temperature?: number
      maxTokens?: number
      contextMaxDepth?: number
      systemPrompt?: string
      promptTemplates?: {
        directExpand?: string
        targetedQuestion?: string
        contextEnvelope?: string
      }
    } = {}

    if (payload.apiKey !== undefined) nextConfig.apiKey = requestApiKey
    if (config.baseURL !== undefined) nextConfig.baseURL = config.baseURL
    if (config.model !== undefined) nextConfig.model = config.model
    if (config.apiStyle !== undefined) nextConfig.apiStyle = config.apiStyle
    if (config.answerAnchorKeywords !== undefined) nextConfig.answerAnchorKeywords = config.answerAnchorKeywords
    if (config.temperature !== undefined) nextConfig.temperature = config.temperature
    if (config.maxTokens !== undefined) nextConfig.maxTokens = config.maxTokens
    if (config.contextMaxDepth !== undefined) nextConfig.contextMaxDepth = config.contextMaxDepth
    if (config.systemPrompt !== undefined) nextConfig.systemPrompt = config.systemPrompt
    if (config.promptTemplates !== undefined) nextConfig.promptTemplates = config.promptTemplates

    if (Object.keys(nextConfig).length > 0) {
      setLLMConfig(nextConfig)
    }

    const keySourceHint = resolveRuntimeApiKeySource(requestApiKey)
    const runtimeSnapshot = createRuntimeSnapshot(keySourceHint)
    const diagnostics: string[] = []
    let runtimeSyncState: RuntimeSyncState = 'synced'
    let lastSyncError = ''

    const keyMissing = !runtimeSnapshot.hasApiKey
    const blockedRuntimeFallback = !allowRuntimeApiKeyFallback && keySourceHint === 'runtime' && !requestApiKey

    if (!runtimeSnapshot.baseURL.trim()) {
      diagnostics.push('missing_base_url')
    }
    if (!runtimeSnapshot.model.trim()) {
      diagnostics.push('missing_model')
    }
    if (keyMissing || blockedRuntimeFallback) {
      diagnostics.push('missing_key')
      lastSyncError = 'API Key is missing'
      runtimeSyncState = 'failed'
    }

    const health = createProfileHealth({
      profileId,
      snapshot: runtimeSnapshot,
      runtimeSyncState,
      lastSyncError: lastSyncError || undefined
    })
    const success = health.readiness === 'ready'

    if (!success && health.readiness !== 'missing_key') {
      runtimeSyncState = 'failed'
    }

    return {
      success,
      runtimeSnapshot,
      health: createProfileHealth({
        profileId,
        snapshot: runtimeSnapshot,
        runtimeSyncState,
        lastSyncError: health.lastSyncError
      }),
      diagnostics
    }
  }

  fastify.post('/api/config/llm/sync', async (request) => {
    const body = request.body as SyncRequestBody
    const result = syncRuntimeConfig(body)
    return {
      ...result,
      hasApiKey: result.runtimeSnapshot.hasApiKey
    }
  })

  // Legacy compatibility wrapper.
  fastify.post('/api/config/llm', async (request) => {
    const body = request.body as {
      apiKey?: string
      baseURL?: string
      model?: string
      apiStyle?: ApiStyle
      answerAnchorKeywords?: string[]
      temperature?: number
      maxTokens?: number
      contextMaxDepth?: number
      systemPrompt?: string
      promptTemplates?: {
        directExpand?: string
        targetedQuestion?: string
        contextEnvelope?: string
      }
    }

    const result = syncRuntimeConfig({
      profileId: 'legacy-profile',
      config: {
        baseURL: body.baseURL,
        model: body.model,
        apiStyle: body.apiStyle,
        answerAnchorKeywords: body.answerAnchorKeywords,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        contextMaxDepth: body.contextMaxDepth,
        systemPrompt: body.systemPrompt,
        promptTemplates: body.promptTemplates
      },
      apiKey: body.apiKey,
      allowRuntimeApiKeyFallback: true
    })

    return {
      success: result.success,
      hasApiKey: result.runtimeSnapshot.hasApiKey
    }
  })

  fastify.get('/api/config/state', async (request) => {
    const profileId = String((request.query as { profileId?: string } | undefined)?.profileId || 'active-profile')
    const runtimeSnapshot = createRuntimeSnapshot()
    const health = createProfileHealth({
      profileId,
      snapshot: runtimeSnapshot,
      runtimeSyncState: 'idle'
    })

    return {
      runtimeSnapshot,
      health,
      diagnostics: []
    }
  })

  // Legacy compatibility wrapper.
  fastify.get('/api/config/llm/status', async (request) => {
    const profileId = String((request.query as { profileId?: string } | undefined)?.profileId || 'active-profile')
    const runtimeSnapshot = createRuntimeSnapshot()
    const health = createProfileHealth({
      profileId,
      snapshot: runtimeSnapshot,
      runtimeSyncState: 'idle'
    })

    return {
      hasApiKey: runtimeSnapshot.hasApiKey,
      runtimeSnapshot,
      health
    }
  })

  fastify.post('/api/config/models', async (request, reply) => {
    const { apiKey, baseURL, apiStyle, modelsPath } = request.body as {
      apiKey?: string
      baseURL?: string
      apiStyle?: ApiStyle
      modelsPath?: string
    }

    try {
      const runtime = getLLMConfig()
      const resolvedStyle = apiStyle || runtime.apiStyle
      const resolvedApiKey = (apiKey || '').trim() || runtime.apiKey
      const models = await listAvailableModels({
        apiKey: resolvedApiKey,
        baseURL: baseURL || runtime.baseURL,
        apiStyle: resolvedStyle,
        modelsPath
      })
      const provider = getProviderDefinitionByApiStyle(resolvedStyle)
      return {
        models,
        keySource: resolveRuntimeApiKeySource((apiKey || '').trim()),
        providerId: provider.id
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取模型列表失败'
      return reply.code(400).send({ error: message })
    }
  })
}
