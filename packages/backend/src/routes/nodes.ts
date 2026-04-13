import { FastifyInstance } from 'fastify'
import { buildExpandPrompt, generateContent, generateWithContext, getLLMConfig, listAvailableModels, setLLMConfig, type ApiStyle } from '../services/llm.js'
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

  fastify.post('/api/config/llm', async (request, reply) => {
    const { apiKey, baseURL, model, apiStyle, answerAnchorKeywords, temperature, maxTokens, contextMaxDepth, systemPrompt, promptTemplates } = request.body as {
      apiKey: string
      baseURL: string
      model: string
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
    setLLMConfig({ apiKey, baseURL, model, apiStyle, answerAnchorKeywords, temperature, maxTokens, contextMaxDepth, systemPrompt, promptTemplates })
    return { success: true }
  })

  fastify.get('/api/config/llm/status', async () => {
    const cfg = getLLMConfig()
    return {
      hasApiKey: Boolean(cfg.apiKey.trim())
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
      const models = await listAvailableModels({
        apiKey: apiKey || runtime.apiKey,
        baseURL: baseURL || runtime.baseURL,
        apiStyle: apiStyle || runtime.apiStyle,
        modelsPath
      })
      return { models }
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取模型列表失败'
      return reply.code(400).send({ error: message })
    }
  })
}
