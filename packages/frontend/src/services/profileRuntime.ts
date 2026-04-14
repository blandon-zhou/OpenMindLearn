import type { LLMProfile, LLMSettings, ProfileHealth, RuntimeSnapshot } from '../stores/settingsStore'
import { useSettingsStore } from '../stores/settingsStore'
import { getRuntimeConfigState, listAvailableModels, syncRuntimeLLMConfig } from './api'
import { getSecret } from './secureSecret'

export function getLLMProfileById(llmSettings: LLMSettings, profileId: string): LLMProfile | undefined {
  return llmSettings.profiles.find((profile) => profile.id === profileId)
}

export function getActiveLLMProfile(llmSettings: LLMSettings): LLMProfile {
  return getLLMProfileById(llmSettings, llmSettings.activeProfileId) || llmSettings.profiles[0]
}

async function resolveProfileApiKey(profile: LLMProfile): Promise<string> {
  return (await getSecret(profile.secret.secretId))?.trim() || ''
}

function assertProfileReady(profile: LLMProfile) {
  if (!profile.config.baseURL.trim()) throw new Error('Base URL is required')
  if (!profile.config.model.trim()) throw new Error('Model is required')
}

function applyRuntimeState(runtimeSnapshot?: RuntimeSnapshot, health?: ProfileHealth): void {
  const { setRuntimeSnapshot, setProfileHealth } = useSettingsStore.getState()
  if (runtimeSnapshot) {
    setRuntimeSnapshot(runtimeSnapshot)
  }
  if (health) {
    setProfileHealth(health.profileId, health)
  }
}

function toSyncErrorMessage(health: ProfileHealth): string {
  if (health.lastSyncError) return health.lastSyncError
  if (health.readiness === 'missing_base_url') return 'Base URL is required'
  if (health.readiness === 'missing_model') return 'Model is required'
  if (health.readiness === 'missing_key') return 'API Key is missing'
  if (health.readiness === 'sync_failed') return 'Runtime sync failed'
  return 'Runtime sync failed'
}

interface SyncProfileToRuntimeOptions {
  allowRuntimeApiKeyFallback?: boolean
}

export async function syncProfileToRuntime(
  llmSettings: LLMSettings,
  profile: LLMProfile,
  options?: SyncProfileToRuntimeOptions
) {
  assertProfileReady(profile)
  const apiKey = await resolveProfileApiKey(profile)
  const allowRuntimeApiKeyFallback = Boolean(options?.allowRuntimeApiKeyFallback)

  const syncResult = await syncRuntimeLLMConfig({
    profileId: profile.id,
    config: {
      baseURL: profile.config.baseURL,
      model: profile.config.model,
      apiStyle: profile.config.apiStyle,
      requestPathByStyle: profile.config.requestPathByStyle,
      answerAnchorKeywords: llmSettings.answerAnchorKeywords,
      temperature: profile.config.temperature,
      maxTokens: profile.config.maxTokens,
      contextMaxDepth: llmSettings.contextMaxDepth,
      systemPrompt: llmSettings.systemPrompt,
      promptTemplates: llmSettings.promptTemplates
    },
    apiKey: apiKey || undefined,
    allowRuntimeApiKeyFallback
  })

  applyRuntimeState(syncResult.runtimeSnapshot, syncResult.health)
  if (!syncResult.success || syncResult.health.readiness !== 'ready') {
    throw new Error(toSyncErrorMessage(syncResult.health))
  }
  return syncResult
}

export async function refreshRuntimeState(profileId?: string) {
  const state = await getRuntimeConfigState(profileId)
  applyRuntimeState(state.runtimeSnapshot, state.health)
  return state
}

export async function syncActiveProfileToRuntime(llmSettings: LLMSettings) {
  const activeProfile = getActiveLLMProfile(llmSettings)
  await refreshRuntimeState(activeProfile.id)
  return syncProfileToRuntime(llmSettings, activeProfile, {
    allowRuntimeApiKeyFallback: true
  })
}

export async function fetchProfileModels(profile: LLMProfile, overrideApiKey?: string) {
  let apiKey = (overrideApiKey || '').trim()
  if (!apiKey) {
    // Allow backend runtime/env fallback when profile secret is not readable locally.
    apiKey = await resolveProfileApiKey(profile)
  }
  return listAvailableModels({
    apiKey,
    baseURL: profile.config.baseURL,
    apiStyle: profile.config.apiStyle,
    modelsPath: profile.config.modelsPath
  })
}
