import { getLLMConfig, getRuntimeConfigUpdatedAt, resolveRuntimeApiKeySource } from './config.js'
import { getProviderDefinitionByApiStyle } from './providerRegistry.js'
import type {
  ProfileHealth,
  ReadinessState,
  RuntimeKeySource,
  RuntimeSnapshot,
  RuntimeSyncState,
  SecretAvailability
} from './types.js'

function resolveSecretAvailability(keySource: RuntimeKeySource): SecretAvailability {
  if (keySource === 'env') return 'env'
  if (keySource === 'request' || keySource === 'runtime') return 'runtime'
  return 'missing'
}

function resolveReadiness(snapshot: RuntimeSnapshot, runtimeSyncState: RuntimeSyncState): ReadinessState {
  if (!snapshot.baseURL.trim()) return 'missing_base_url'
  if (!snapshot.model.trim()) return 'missing_model'
  if (!snapshot.hasApiKey) return 'missing_key'
  if (runtimeSyncState === 'failed') return 'sync_failed'
  return 'ready'
}

export function createRuntimeSnapshot(keySourceHint?: RuntimeKeySource): RuntimeSnapshot {
  const cfg = getLLMConfig()
  const provider = getProviderDefinitionByApiStyle(cfg.apiStyle)
  const keySource = keySourceHint || resolveRuntimeApiKeySource()

  return {
    hasApiKey: keySource !== 'none',
    keySource,
    providerId: provider.id,
    baseURL: cfg.baseURL,
    model: cfg.model,
    apiStyle: cfg.apiStyle,
    updatedAt: getRuntimeConfigUpdatedAt()
  }
}

interface CreateProfileHealthInput {
  profileId: string
  snapshot: RuntimeSnapshot
  runtimeSyncState: RuntimeSyncState
  lastSyncError?: string
}

export function createProfileHealth(input: CreateProfileHealthInput): ProfileHealth {
  const { profileId, snapshot, runtimeSyncState, lastSyncError } = input
  const readiness = resolveReadiness(snapshot, runtimeSyncState)

  return {
    profileId,
    providerId: snapshot.providerId,
    secretAvailability: resolveSecretAvailability(snapshot.keySource),
    runtimeSyncState,
    readiness,
    lastSyncError,
    updatedAt: new Date().toISOString()
  }
}

