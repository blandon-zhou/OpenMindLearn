import type { ExpandMode, PromptTemplates } from './types.js'

export const DEFAULT_SYSTEM_PROMPT = `# 角色与目标
你是 OpenMindLearn 的学习教练型助手，目标是帮助用户“理解 -> 记住 -> 会用”。

## 交互风格
1. 支持性与详尽性：耐心、清晰、结构化地讲透复杂主题。
2. 轻松自然的互动：保持友好与温度，但不过度闲聊。
3. 自适应教学：根据用户熟练度动态调整深浅与术语密度。
4. 建立信心：鼓励探索与提问，给出可执行的下一步。

## 输出协议
1. 优先使用用户输入语言；未指定时使用简体中文。
2. 最终答案默认使用 Markdown；建议先给结论（可使用“## 结论”），再展开说明。
3. 结构按任务复杂度自适应：简单问题可简洁，复杂问题应充分展开，不为简短牺牲关键信息。
4. 若输入中出现如 <input> 或 <task> 这类 XML 区块，请按其语义理解内容，再结合上下文回答。
5. 信息不足时先说明缺失信息与假设，再给当前最可靠答案。
6. 不编造事实；涉及不确定内容时明确标注置信度或待确认点。

## 思考与展示
1. 允许充分思考。
2. 若模型返回思考内容，必须与最终答案严格分离；最终答案正文不得混入 think/analysis 标记或内部推理片段。
3. 最终答案聚焦对学习者有用的结果，不复述内部思考过程。`

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplates = {
  directExpand: `# 任务定义
请将输入内容扩展为高质量学习材料，目标是“帮助学习者真正理解并能迁移应用”。

## 任务要求
1. 与输入内容强关联，先解释原意，再做必要延展。
2. 补充关键概念定义、关系说明、机制脉络和适用边界。
3. 尽量提供能落地的示例、反例或类比，帮助迁移应用。
4. 若原文存在歧义，先写明你的理解假设。

## 输入内容
<input>
{{text}}
</input>`,
  targetedQuestion: `# 任务定义
请针对输入的问题或指令给出高质量、可落地的学习回答。

## 任务要求
1. 直接响应核心问题，不要偏题。
2. 补充关键依据与原理，兼顾“为什么”和“怎么做”。
3. 必要时给出步骤、对比、反例或最小可用示例。
4. 若存在条件限制或适用边界，请明确指出。

## 输入内容
<input>
{{text}}
</input>`,
  contextEnvelope: `# 任务定义
你正在为 OpenMindLearn 生成学习节点。请基于上下文完成当前任务，并优先保证输出质量与学习价值。

## 处理原则
1. 把“最后一个节点”视为当前焦点，优先服务它。
2. 上游节点用于补充背景、术语和因果链，不要平均分配篇幅。
3. 若上下文信息冲突，优先采用更接近焦点且更具体的信息，并在答案中简要说明假设。
4. 不要复述 XML 标签本身。

## 上下文链（XML）
{{contextXml}}

## 当前任务
<task>
{{prompt}}
</task>`
}

export const DEFAULT_ANSWER_ANCHOR_KEYWORDS = ['结论']

function getRequiredTokenPlaceholder(token: string): string {
  if (token === 'text') return `<input>\n{{text}}\n</input>`
  if (token === 'prompt') return `<task>\n{{prompt}}\n</task>`
  return `{{${token}}}`
}

export function resolveTemplate(template: string | undefined, fallback: string, requiredTokens: string[]): string {
  const value = (template || '').trim()
  if (!value) return fallback
  let resolved = value
  requiredTokens.forEach((token) => {
    if (!resolved.includes(`{{${token}}}`)) {
      resolved = `${resolved}\n\n${getRequiredTokenPlaceholder(token)}`
    }
  })
  return resolved
}

export function applyTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => variables[key] ?? '')
}

function getExpandPromptTemplate(mode: ExpandMode, templates: PromptTemplates): string {
  if (mode === 'targeted') return templates.targetedQuestion
  return templates.directExpand
}

export function buildExpandPromptFromTemplates(text: string, mode: ExpandMode, templates: PromptTemplates): string {
  const template = getExpandPromptTemplate(mode, templates)
  return applyTemplate(template, { text })
}

export function buildContextPromptFromTemplates(prompt: string, contextXml: string, templates: PromptTemplates): string {
  return applyTemplate(templates.contextEnvelope, {
    prompt,
    contextXml
  })
}
