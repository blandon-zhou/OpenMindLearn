import type { LLMProfile, LLMSettings } from '../stores/settingsStore'
import { listAvailableModels, updateLLMConfig } from './api'
import { getSecret } from './secureSecret'

export function getLLMProfileById(llmSettings: LLMSettings, profileId: string): LLMProfile | undefined {
  return llmSettings.profiles.find((profile) => profile.id === profileId)
}

export function getActiveLLMProfile(llmSettings: LLMSettings): LLMProfile {
  return getLLMProfileById(llmSettings, llmSettings.activeProfileId) || llmSettings.profiles[0]
}

async function resolveProfileApiKey(profile: LLMProfile): Promise<string> {
  const apiKey = (await getSecret(profile.secret.secretId))?.trim() || ''
  if (!apiKey) throw new Error('API Key is missing')
  return apiKey
}

function assertProfileReady(profile: LLMProfile) {
  if (!profile.config.baseURL.trim()) throw new Error('Base URL is required')
  if (!profile.config.model.trim()) throw new Error('Model is required')
}

export async function syncProfileToRuntime(llmSettings: LLMSettings, profile: LLMProfile) {
  assertProfileReady(profile)
  const apiKey = await resolveProfileApiKey(profile)

  await updateLLMConfig({
    apiKey,
    baseURL: profile.config.baseURL,
    model: profile.config.model,
    apiStyle: profile.config.apiStyle,
    answerAnchorKeywords: llmSettings.answerAnchorKeywords,
    temperature: profile.config.temperature,
    maxTokens: profile.config.maxTokens,
    contextMaxDepth: llmSettings.contextMaxDepth,
    systemPrompt: llmSettings.systemPrompt,
    promptTemplates: llmSettings.promptTemplates
  })
}

export async function syncActiveProfileToRuntime(llmSettings: LLMSettings) {
  const activeProfile = getActiveLLMProfile(llmSettings)
  return syncProfileToRuntime(llmSettings, activeProfile)
}

export async function fetchProfileModels(profile: LLMProfile, overrideApiKey?: string) {
  const apiKey = (overrideApiKey || '').trim() || await resolveProfileApiKey(profile)
  return listAvailableModels({
    apiKey,
    baseURL: profile.config.baseURL,
    apiStyle: profile.config.apiStyle
  })
}
