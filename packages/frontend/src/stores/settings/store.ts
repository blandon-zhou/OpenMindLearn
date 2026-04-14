import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getBrowserLanguage, resolveLocaleMode } from '../../i18n'
import type { LocaleCode } from '../../i18n/types'
import { clonePromptTemplates } from './defaults'
import {
  createLLMProfile,
  ensureActiveProfileState,
  getDefaultUISettings,
  normalizeLLMProfileConfig,
  normalizeLLMSettings,
  normalizeLocalizedPrompt,
  normalizeUISettings,
  resolvePromptLocale
} from './normalize'
import type {
  LLMProfileConfig,
  LLMProfileSecret,
  LLMSettings,
  LocalizedPromptConfig,
  SettingsStore
} from './types'

const DEFAULT_LLM_SETTINGS = normalizeLLMSettings()
const DEFAULT_UI_SETTINGS = getDefaultUISettings()

function applyPromptPatch(state: LLMSettings, settings: Partial<LLMSettings>): LLMSettings {
  const mergedLocalizedPrompts: Record<LocaleCode, LocalizedPromptConfig> = {
    'zh-CN': normalizeLocalizedPrompt('zh-CN', {
      ...state.localizedPrompts['zh-CN'],
      ...(settings.localizedPrompts?.['zh-CN'] || {})
    }),
    'en-US': normalizeLocalizedPrompt('en-US', {
      ...state.localizedPrompts['en-US'],
      ...(settings.localizedPrompts?.['en-US'] || {})
    })
  }

  const nextPromptLocale = resolvePromptLocale(settings.promptLocale ?? state.promptLocale)
  const shouldUpdateActivePrompt = (
    settings.systemPrompt !== undefined
    || settings.promptTemplates !== undefined
    || settings.answerAnchorKeywords !== undefined
  )

  if (shouldUpdateActivePrompt) {
    const currentActive = mergedLocalizedPrompts[nextPromptLocale]
    mergedLocalizedPrompts[nextPromptLocale] = normalizeLocalizedPrompt(nextPromptLocale, {
      ...currentActive,
      systemPrompt: settings.systemPrompt ?? currentActive.systemPrompt,
      promptTemplates: {
        ...currentActive.promptTemplates,
        ...(settings.promptTemplates || {})
      },
      answerAnchorKeywords: settings.answerAnchorKeywords ?? currentActive.answerAnchorKeywords
    })
  }

  const activePromptConfig = mergedLocalizedPrompts[nextPromptLocale]

  return {
    ...state,
    ...settings,
    promptLocale: nextPromptLocale,
    localizedPrompts: mergedLocalizedPrompts,
    systemPrompt: activePromptConfig.systemPrompt,
    promptTemplates: clonePromptTemplates(activePromptConfig.promptTemplates),
    answerAnchorKeywords: [...activePromptConfig.answerAnchorKeywords]
  }
}

function updateProfileConfigById(
  state: LLMSettings,
  profileId: string,
  patch: Partial<LLMProfileConfig>
): LLMSettings {
  const now = new Date().toISOString()
  return {
    ...state,
    profiles: state.profiles.map((profile) => {
      if (profile.id !== profileId) return profile
      return {
        ...profile,
        config: normalizeLLMProfileConfig({
          ...profile.config,
          ...patch
        }),
        updatedAt: now
      }
    })
  }
}

function updateProfileSecretById(
  state: LLMSettings,
  profileId: string,
  patch: Partial<LLMProfileSecret>
): LLMSettings {
  const now = new Date().toISOString()
  return {
    ...state,
    profiles: state.profiles.map((profile) => {
      if (profile.id !== profileId) return profile
      return {
        ...profile,
        secret: {
          ...profile.secret,
          ...patch
        },
        updatedAt: now
      }
    })
  }
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      llmSettings: DEFAULT_LLM_SETTINGS,
      uiSettings: DEFAULT_UI_SETTINGS,
      runtimeSnapshot: null,
      profileHealthById: {},
      updateLLMSettings: (settings: Partial<LLMSettings>) => set((state) => {
        let next = applyPromptPatch(state.llmSettings, settings)

        const profileConfigPatch: Partial<LLMProfileConfig> = {}
        if (settings.baseURL !== undefined) profileConfigPatch.baseURL = settings.baseURL
        if (settings.modelsPath !== undefined) profileConfigPatch.modelsPath = settings.modelsPath
        if (settings.model !== undefined) profileConfigPatch.model = settings.model
        if (settings.apiStyle !== undefined) profileConfigPatch.apiStyle = settings.apiStyle
        if (settings.temperature !== undefined) profileConfigPatch.temperature = settings.temperature
        if (settings.maxTokens !== undefined) profileConfigPatch.maxTokens = settings.maxTokens

        if (Object.keys(profileConfigPatch).length > 0) {
          next = updateProfileConfigById(next, next.activeProfileId, profileConfigPatch)
        }

        return {
          llmSettings: ensureActiveProfileState(next)
        }
      }),
      createLLMProfile: (name?: string) => {
        let createdId = ''
        set((state) => {
          const activeProfile = state.llmSettings.profiles.find((profile) => profile.id === state.llmSettings.activeProfileId)
          const profile = createLLMProfile(
            (name || '').trim() || `配置 ${state.llmSettings.profiles.length + 1}`,
            activeProfile?.config
          )
          profile.modelOptionsCache = [...(activeProfile?.modelOptionsCache || [])]
          createdId = profile.id

          return {
            llmSettings: {
              ...state.llmSettings,
              profiles: [...state.llmSettings.profiles, profile]
            },
            profileHealthById: state.profileHealthById
          }
        })
        return createdId
      },
      renameLLMProfile: (profileId: string, name: string) => set((state) => {
        const nextName = name.trim()
        if (!nextName) return {}

        return {
          llmSettings: {
            ...state.llmSettings,
            profiles: state.llmSettings.profiles.map((profile) =>
              profile.id === profileId
                ? { ...profile, name: nextName, updatedAt: new Date().toISOString() }
                : profile
            )
          }
        }
      }),
      deleteLLMProfile: (profileId: string) => set((state) => {
        if (state.llmSettings.profiles.length <= 1) return {}
        const nextProfiles = state.llmSettings.profiles.filter((profile) => profile.id !== profileId)
        if (nextProfiles.length === state.llmSettings.profiles.length) return {}

        const nextActiveProfileId = state.llmSettings.activeProfileId === profileId
          ? nextProfiles[0].id
          : state.llmSettings.activeProfileId

        const nextProfileHealthById = { ...state.profileHealthById }
        delete nextProfileHealthById[profileId]

        return {
          llmSettings: ensureActiveProfileState({
            ...state.llmSettings,
            profiles: nextProfiles,
            activeProfileId: nextActiveProfileId
          }),
          profileHealthById: nextProfileHealthById
        }
      }),
      setActiveLLMProfile: (profileId: string) => set((state) => {
        if (!state.llmSettings.profiles.some((profile) => profile.id === profileId)) return {}
        if (state.llmSettings.activeProfileId === profileId) return {}

        return {
          llmSettings: ensureActiveProfileState({
            ...state.llmSettings,
            activeProfileId: profileId
          })
        }
      }),
      updateLLMProfileConfig: (profileId: string, config: Partial<LLMProfileConfig>) => set((state) => ({
        llmSettings: ensureActiveProfileState(updateProfileConfigById(state.llmSettings, profileId, config))
      })),
      updateLLMProfileSecret: (profileId: string, secret: Partial<LLMProfileSecret>) => set((state) => ({
        llmSettings: ensureActiveProfileState(updateProfileSecretById(state.llmSettings, profileId, secret))
      })),
      setLLMProfileModelOptionsCache: (profileId: string, models: string[]) => set((state) => {
        const normalizedModels: string[] = Array.from(new Set(models.map((item) => item.trim()).filter(Boolean)))

        return {
          llmSettings: {
            ...state.llmSettings,
            profiles: state.llmSettings.profiles.map((profile) =>
              profile.id === profileId
                ? {
                    ...profile,
                    modelOptionsCache: normalizedModels,
                    updatedAt: new Date().toISOString()
                  }
                : profile
            )
          }
        }
      }),
      setRuntimeSnapshot: (snapshot) => set(() => ({ runtimeSnapshot: snapshot })),
      setProfileHealth: (profileId, health) => set((state) => ({
        profileHealthById: {
          ...state.profileHealthById,
          [profileId]: health
        }
      })),
      removeProfileHealth: (profileId) => set((state) => {
        const nextProfileHealthById = { ...state.profileHealthById }
        delete nextProfileHealthById[profileId]
        return { profileHealthById: nextProfileHealthById }
      }),
      updateUISettings: (settings) => set((state) => {
        const nextTheme = settings.theme ?? state.uiSettings.theme
        const nextLocaleMode = settings.localeMode ?? state.uiSettings.localeMode
        const nextLocaleResolved = settings.localeMode
          ? resolveLocaleMode(settings.localeMode, getBrowserLanguage())
          : settings.localeResolved ?? state.uiSettings.localeResolved

        return {
          uiSettings: {
            theme: nextTheme,
            localeMode: nextLocaleMode,
            localeResolved: nextLocaleResolved
          }
        }
      }),
      setTheme: (theme) => set((state) => ({
        uiSettings: {
          ...state.uiSettings,
          theme
        }
      })),
      setLocaleMode: (mode) => set((state) => ({
        uiSettings: {
          ...state.uiSettings,
          localeMode: mode,
          localeResolved: resolveLocaleMode(mode, getBrowserLanguage())
        }
      })),
      syncLocaleFromNavigator: () => set((state) => {
        if (state.uiSettings.localeMode !== 'auto') return {}
        const resolved = resolveLocaleMode('auto', getBrowserLanguage())
        if (resolved === state.uiSettings.localeResolved) return {}
        return {
          uiSettings: {
            ...state.uiSettings,
            localeResolved: resolved
          }
        }
      })
    }),
    {
      name: 'oml-settings',
      version: 2,
      merge: (persisted, current) => {
        const persistedState = (persisted || {}) as Partial<SettingsStore>
        const mergedLLM = normalizeLLMSettings({
          ...(current.llmSettings as unknown as Record<string, unknown>),
          ...((persistedState.llmSettings || {}) as unknown as Record<string, unknown>)
        })
        const mergedUI = normalizeUISettings({
          ...current.uiSettings,
          ...(persistedState.uiSettings || {})
        })

        return {
          ...current,
          ...persistedState,
          llmSettings: mergedLLM,
          uiSettings: mergedUI
        } as SettingsStore
      },
      partialize: (state) => ({
        llmSettings: state.llmSettings,
        uiSettings: state.uiSettings
      })
    }
  )
)
