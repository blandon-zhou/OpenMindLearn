import type { SecretProvider } from '../stores/settings/types'

const SESSION_SECRET_CACHE = new Map<string, string>()

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
      return 'os_keychain'
    } catch {
      SESSION_SECRET_CACHE.set(key, value)
      return 'webcrypto'
    }
  }

  // Web fallback: keep only in session memory and never persist plaintext.
  SESSION_SECRET_CACHE.set(key, value)
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
  if (!sessionValue) return null

  // Promote migrated legacy key to desktop encrypted store if available.
  if (desktopSecret) {
    try {
      await desktopSecret.set(key, sessionValue)
      SESSION_SECRET_CACHE.delete(key)
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
  const desktopSecret = getDesktopSecretBridge()
  if (desktopSecret) {
    try {
      await desktopSecret.remove(key)
    } catch {
      // ignore fallback cleanup
    }
  }
}
