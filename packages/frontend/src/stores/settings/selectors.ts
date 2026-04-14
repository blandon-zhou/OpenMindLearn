import { resolveProviderIdFromApiStyle } from '../../services/providerRegistry'
import type { ProfileHealth, ReadinessState, SecretAvailability, SettingsStore } from './types'

function deriveReadiness(baseURL: string, model: string, hasKey: boolean): ReadinessState {
  if (!baseURL.trim()) return 'missing_base_url'
  if (!model.trim()) return 'missing_model'
  if (!hasKey) return 'missing_key'
  return 'ready'
}

function deriveFallbackHealth(state: SettingsStore, profileId: string): ProfileHealth | null {
  const profile = state.llmSettings.profiles.find((item) => item.id === profileId)
  if (!profile) return null

  const runtime = state.runtimeSnapshot
  const isActiveProfile = state.llmSettings.activeProfileId === profile.id

  let secretAvailability: SecretAvailability = profile.secret.hasApiKey ? 'local' : 'missing'
  if (!profile.secret.hasApiKey && isActiveProfile && runtime?.hasApiKey) {
    secretAvailability = runtime.keySource === 'env' ? 'env' : 'runtime'
  }

  const hasKey = secretAvailability !== 'missing'
  return {
    profileId: profile.id,
    providerId: resolveProviderIdFromApiStyle(profile.config.apiStyle),
    secretAvailability,
    runtimeSyncState: isActiveProfile && runtime ? 'stale' : 'idle',
    readiness: deriveReadiness(profile.config.baseURL, profile.config.model, hasKey),
    updatedAt: runtime?.updatedAt || profile.updatedAt
  }
}

export function selectProfileHealth(state: SettingsStore, profileId: string): ProfileHealth | null {
  return state.profileHealthById[profileId] || deriveFallbackHealth(state, profileId)
}

export function selectActiveProfileHealth(state: SettingsStore): ProfileHealth | null {
  return selectProfileHealth(state, state.llmSettings.activeProfileId)
}

export function selectProfileReadiness(state: SettingsStore, profileId: string): ReadinessState {
  return selectProfileHealth(state, profileId)?.readiness || 'missing_key'
}

export function selectToolbarIndicatorState(state: SettingsStore): { ready: boolean; health: ProfileHealth | null } {
  const health = selectActiveProfileHealth(state)
  return {
    ready: health?.readiness === 'ready',
    health
  }
}
