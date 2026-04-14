import type { SecretProvider } from '../stores/settings/types'

const SESSION_SECRET_CACHE = new Map<string, string>()
const SESSION_STORAGE_KEY_PREFIX = 'oml-secret:'

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function resolveSessionStorageKey(secretId: string): string {
  return `${SESSION_STORAGE_KEY_PREFIX}${secretId}`
}

function setSessionSecret(secretId: string, plaintext: string): void {
  if (!canUseSessionStorage()) return
  try {
    window.sessionStorage.setItem(resolveSessionStorageKey(secretId), plaintext)
  } catch {
    // ignore storage errors and fallback to in-memory cache
  }
}

function getSessionSecret(secretId: string): string | null {
  if (!canUseSessionStorage()) return null
  try {
    return window.sessionStorage.getItem(resolveSessionStorageKey(secretId))
  } catch {
    return null
  }
}

function removeSessionSecret(secretId: string): void {
  if (!canUseSessionStorage()) return
  try {
    window.sessionStorage.removeItem(resolveSessionStorageKey(secretId))
  } catch {
    // ignore storage cleanup errors
  }
}

function getDesktopSecretBridge() {
  return window.omlDesktop?.secureSecret
}

export function getDefaultSecretProvider(): SecretProvider {
  return getDesktopSecretBridge() ? 'os_keychain' : 'webcrypto'
}

export function buildProfileSecretId(profileId: string): string {
  return `llm-profile:${profileId}:api-key`
}

export async function setSecret(secretId: string, plaintext: string): Promise<SecretProvider> {
  const key = secretId.trim()
  const value = plaintext.trim()
  if (!key) throw new Error('Invalid secret id')
  if (!value) throw new Error('API Key is empty')

  const desktopSecret = getDesktopSecretBridge()
  if (desktopSecret) {
    try {
      await desktopSecret.set(key, value)
      SESSION_SECRET_CACHE.delete(key)
      removeSessionSecret(key)
      return 'os_keychain'
    } catch {
      SESSION_SECRET_CACHE.set(key, value)
      setSessionSecret(key, value)
      return 'webcrypto'
    }
  }

  // Web fallback: keep key in current browser session only.
  SESSION_SECRET_CACHE.set(key, value)
  setSessionSecret(key, value)
  return 'webcrypto'
}

export async function getSecret(secretId: string): Promise<string | null> {
  const key = secretId.trim()
  if (!key) return null

  const desktopSecret = getDesktopSecretBridge()
  if (desktopSecret) {
    try {
      const persisted = await desktopSecret.get(key)
      if (persisted) return persisted
    } catch {
      // ignore and fallback to in-memory secret
    }
  }

  const sessionValue = SESSION_SECRET_CACHE.get(key) || null
  if (!sessionValue) {
    const persistedInSession = getSessionSecret(key)
    if (!persistedInSession) return null
    SESSION_SECRET_CACHE.set(key, persistedInSession)
    return persistedInSession
  }

  // Promote migrated legacy key to desktop encrypted store if available.
  if (desktopSecret) {
    try {
      await desktopSecret.set(key, sessionValue)
      SESSION_SECRET_CACHE.delete(key)
      removeSessionSecret(key)
      return sessionValue
    } catch {
      return sessionValue
    }
  }

  return sessionValue
}

export async function removeSecret(secretId: string): Promise<void> {
  const key = secretId.trim()
  if (!key) return

  SESSION_SECRET_CACHE.delete(key)
  removeSessionSecret(key)
  const desktopSecret = getDesktopSecretBridge()
  if (desktopSecret) {
    try {
      await desktopSecret.remove(key)
    } catch {
      // ignore fallback cleanup
    }
  }
}
