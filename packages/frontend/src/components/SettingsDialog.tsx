import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_ANSWER_ANCHOR_KEYWORDS_BY_LOCALE,
  DEFAULT_PROMPT_TEMPLATES_BY_LOCALE,
  DEFAULT_SYSTEM_PROMPT_BY_LOCALE,
  type ApiStyle,
  type ExpandMode,
  type PromptTemplates,
  type ThemeMode,
  useSettingsStore
} from '../stores/settingsStore'
import type { LocaleCode, LocaleMode } from '../i18n/types'
import { fetchProfileModels, getLLMProfileById, syncProfileToRuntime } from '../services/profileRuntime'
import { getRuntimeLLMConfigStatus } from '../services/api'
import { getSecret, removeSecret, setSecret } from '../services/secureSecret'
import { useToastStore } from '../stores/toastStore'
import { Copy, Moon, Plus, Sun, Trash2, X } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { Z_INDEX } from '../utils/zIndex'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

const RESET_BUTTON_CLASS = 'px-2.5 py-1 text-xs rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors'
const UNBOUNDED_MAX_TOKENS = Number.MAX_SAFE_INTEGER
type PreviewSource = ExpandMode | 'context_envelope'

function getRequiredTokenPlaceholder(token: string): string {
  if (token === 'text') return `<input>\n{{text}}\n</input>`
  if (token === 'prompt') return `<task>\n{{prompt}}\n</task>`
  return `{{${token}}}`
}

function resolveTemplate(template: string | undefined, fallback: string, requiredTokens: string[]): string {
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

function applyTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => variables[key] ?? '')
}

function resolvePreviewTemplates(promptLocale: LocaleCode, templates: PromptTemplates): PromptTemplates {
  const fallback = DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale]
  return {
    directExpand: resolveTemplate(templates.directExpand, fallback.directExpand, ['text']),
    targetedQuestion: resolveTemplate(templates.targetedQuestion, fallback.targetedQuestion, ['text']),
    contextEnvelope: resolveTemplate(templates.contextEnvelope, fallback.contextEnvelope, ['contextXml', 'prompt'])
  }
}

function getLocalePromptConfig(llmSettings: ReturnType<typeof useSettingsStore.getState>['llmSettings'], locale: LocaleCode) {
  return llmSettings.localizedPrompts[locale] || {
    systemPrompt: DEFAULT_SYSTEM_PROMPT_BY_LOCALE[locale],
    promptTemplates: DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[locale],
    answerAnchorKeywords: DEFAULT_ANSWER_ANCHOR_KEYWORDS_BY_LOCALE[locale]
  }
}

function getDefaultPreviewInput(locale: LocaleCode): string {
  return locale === 'zh-CN'
    ? '请解释什么是闭包，并给一个简单示例。'
    : 'Explain what a closure is and give one concise example.'
}

function getDefaultPreviewContextXml(locale: LocaleCode): string {
  return `<context>
  <node id="node-parent">
    <content>${locale === 'zh-CN' ? '函数是一等公民，可以作为值传递。' : 'Functions are first-class values and can be passed around.'}</content>
    <question>${locale === 'zh-CN' ? '函数式编程中的核心概念有哪些？' : 'What are key concepts in functional programming?'}</question>
  </node>
</context>`
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const {
    llmSettings,
    uiSettings,
    updateLLMSettings,
    createLLMProfile,
    renameLLMProfile,
    deleteLLMProfile,
    setActiveLLMProfile,
    updateLLMProfileConfig,
    updateLLMProfileSecret,
    setLLMProfileModelOptionsCache,
    setTheme,
    setLocaleMode
  } = useSettingsStore()

  const { showToast } = useToastStore()
  const { t } = useI18n()

  const [activeTab, setActiveTab] = useState<'llm' | 'prompt' | 'appearance'>('llm')
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [profileNameInput, setProfileNameInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [clearApiKeyOnSave, setClearApiKeyOnSave] = useState(false)
  const [baseURL, setBaseURL] = useState('')
  const [modelsPath, setModelsPath] = useState('')
  const [model, setModel] = useState('')
  const [apiStyle, setApiStyle] = useState<ApiStyle>('openai_chat')
  const [temperature, setTemperature] = useState('0.7')
  const [maxTokens, setMaxTokens] = useState('4096')
  const [contextMaxDepth, setContextMaxDepth] = useState(String(llmSettings.contextMaxDepth))
  const [promptLocale, setPromptLocale] = useState<LocaleCode>(llmSettings.promptLocale)
  const [answerAnchorKeywordsText, setAnswerAnchorKeywordsText] = useState(llmSettings.answerAnchorKeywords.join('\n'))
  const [systemPrompt, setSystemPrompt] = useState(llmSettings.systemPrompt)
  const [directExpandPrompt, setDirectExpandPrompt] = useState(llmSettings.promptTemplates.directExpand)
  const [targetedPrompt, setTargetedPrompt] = useState(llmSettings.promptTemplates.targetedQuestion)
  const [contextEnvelopePrompt, setContextEnvelopePrompt] = useState(llmSettings.promptTemplates.contextEnvelope)
  const [previewSource, setPreviewSource] = useState<PreviewSource | null>(null)
  const [previewInput, setPreviewInput] = useState('')
  const [previewContextXml, setPreviewContextXml] = useState('')
  const [themeMode, setThemeMode] = useState<ThemeMode>(uiSettings.theme)
  const [localeMode, setLocaleModeState] = useState<LocaleMode>(uiSettings.localeMode)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [isModelLibraryOpen, setIsModelLibraryOpen] = useState(false)
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false)
  const [showModelsPathHelp, setShowModelsPathHelp] = useState(false)
  const [profileSearchKeyword, setProfileSearchKeyword] = useState('')
  const [modelSearchKeyword, setModelSearchKeyword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [switchingProfileId, setSwitchingProfileId] = useState('')
  const [resolvedSecretHasApiKey, setResolvedSecretHasApiKey] = useState<boolean | null>(null)
  const [runtimeHasApiKey, setRuntimeHasApiKey] = useState<boolean | null>(null)

  const selectedProfile = useMemo(() => {
    return llmSettings.profiles.find((profile) => profile.id === selectedProfileId) || llmSettings.profiles[0]
  }, [llmSettings.profiles, selectedProfileId])

  const filteredModelOptions = useMemo(() => {
    const keyword = modelSearchKeyword.trim().toLowerCase()
    if (!keyword) return modelOptions
    return modelOptions.filter((item) => item.toLowerCase().includes(keyword))
  }, [modelOptions, modelSearchKeyword])

  const filteredProfiles = useMemo(() => {
    const keyword = profileSearchKeyword.trim().toLowerCase()
    if (!keyword) return llmSettings.profiles

    return llmSettings.profiles.filter((profile) => {
      const haystack = [
        profile.name,
        profile.config.model,
        profile.config.apiStyle,
        profile.config.baseURL
      ].join(' ')
      return haystack.toLowerCase().includes(keyword)
    })
  }, [llmSettings.profiles, profileSearchKeyword])

  const syncPromptFieldsByLocale = (locale: LocaleCode) => {
    const localized = getLocalePromptConfig(llmSettings, locale)
    setSystemPrompt(localized.systemPrompt)
    setDirectExpandPrompt(localized.promptTemplates.directExpand)
    setTargetedPrompt(localized.promptTemplates.targetedQuestion)
    setContextEnvelopePrompt(localized.promptTemplates.contextEnvelope)
    setAnswerAnchorKeywordsText(localized.answerAnchorKeywords.join('\n'))
  }

  useEffect(() => {
    if (!open) return

    setActiveTab('llm')
    setSelectedProfileId(llmSettings.activeProfileId)
    setPromptLocale(llmSettings.promptLocale)
    setContextMaxDepth(String(llmSettings.contextMaxDepth))
    syncPromptFieldsByLocale(llmSettings.promptLocale)
    setThemeMode(uiSettings.theme)
    setLocaleModeState(uiSettings.localeMode)
    setIsProfileEditorOpen(false)
    setIsModelLibraryOpen(false)
    setShowModelsPathHelp(false)
    setSwitchingProfileId('')
    setProfileSearchKeyword('')
    setModelSearchKeyword('')
    setPreviewSource(null)
    setPreviewInput(getDefaultPreviewInput(llmSettings.promptLocale))
    setPreviewContextXml(getDefaultPreviewContextXml(llmSettings.promptLocale))
  }, [open, llmSettings.activeProfileId, llmSettings.promptLocale, llmSettings.contextMaxDepth, uiSettings.theme, uiSettings.localeMode])

  useEffect(() => {
    if (!open) return
    const profile = getLLMProfileById(llmSettings, selectedProfileId)
      || llmSettings.profiles[0]
    if (!profile) return

    setProfileNameInput(profile.name)
    setApiKeyInput('')
    setClearApiKeyOnSave(false)
    setBaseURL(profile.config.baseURL)
    setModelsPath(profile.config.modelsPath || '')
    setModel(profile.config.model)
    setApiStyle(profile.config.apiStyle)
    setTemperature(String(profile.config.temperature))
    setMaxTokens(String(profile.config.maxTokens))
    setModelOptions(profile.modelOptionsCache || [])
    setModelSearchKeyword(profile.config.model)
    setShowModelsPathHelp(false)
  }, [open, selectedProfileId])

  const previewRendered = useMemo(() => {
    if (!previewSource) return null

    const templates = resolvePreviewTemplates(promptLocale, {
      directExpand: directExpandPrompt,
      targetedQuestion: targetedPrompt,
      contextEnvelope: contextEnvelopePrompt
    })

    const resolvedInput = previewInput.trim() || getDefaultPreviewInput(promptLocale)
    const resolvedContextXml = previewContextXml.trim() || getDefaultPreviewContextXml(promptLocale)
    const resolvedSystemPrompt = systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT_BY_LOCALE[promptLocale]

    const modeLabel = (mode: ExpandMode) => {
      if (mode === 'targeted') return t('settings.preview.mode.targeted')
      return t('settings.preview.mode.direct')
    }

    const templateTitle = () => {
      if (previewSource === 'targeted') return t('settings.template.targeted')
      if (previewSource === 'context_envelope') return t('settings.template.contextEnvelope')
      return t('settings.template.direct')
    }

    const buildFinalUserPrompt = (mode: ExpandMode) => {
      const modeTemplate = mode === 'targeted'
        ? templates.targetedQuestion
        : templates.directExpand
      const expandPrompt = applyTemplate(modeTemplate, { text: resolvedInput })
      return applyTemplate(templates.contextEnvelope, {
        contextXml: resolvedContextXml,
        prompt: expandPrompt
      })
    }

    const previewModes: ExpandMode[] = previewSource === 'context_envelope'
      ? ['direct', 'targeted']
      : [previewSource]

    const userPrompts = previewModes.map((mode) => ({
      mode,
      label: modeLabel(mode),
      content: buildFinalUserPrompt(mode)
    }))

    return {
      title: templateTitle(),
      systemPrompt: resolvedSystemPrompt,
      userPrompts
    }
  }, [
    contextEnvelopePrompt,
    directExpandPrompt,
    previewContextXml,
    previewInput,
    previewSource,
    promptLocale,
    systemPrompt,
    t,
    targetedPrompt
  ])

  const handleCopyPromptPreview = async () => {
    if (!previewRendered) return
    const userPromptText = previewRendered.userPrompts
      .map((item) => `${item.label}\n${item.content}`)
      .join('\n\n')
    const text = `${t('settings.preview.systemPrompt')}\n${previewRendered.systemPrompt}\n\n${t('settings.preview.userPrompt')}\n${userPromptText}`
    try {
      await navigator.clipboard.writeText(text)
      showToast(t('settings.preview.copied'), 'success')
    } catch (error) {
      showToast(t('settings.preview.copyFailed'), 'error')
    }
  }

  const openPreview = (source: PreviewSource) => {
    setPreviewSource(source)
    setPreviewInput((prev) => prev.trim() ? prev : getDefaultPreviewInput(promptLocale))
    setPreviewContextXml((prev) => prev.trim() ? prev : getDefaultPreviewContextXml(promptLocale))
  }

  useEffect(() => {
    if (!open) return
    const profile = getLLMProfileById(llmSettings, selectedProfileId)
      || llmSettings.profiles[0]
    if (!profile) return

    let cancelled = false
    setResolvedSecretHasApiKey(null)

    void (async () => {
      const hasApiKey = Boolean((await getSecret(profile.secret.secretId))?.trim())
      if (cancelled) return

      setResolvedSecretHasApiKey(hasApiKey)
      if (profile.secret.hasApiKey !== hasApiKey) {
        updateLLMProfileSecret(profile.id, {
          hasApiKey,
          updatedAt: new Date().toISOString()
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, selectedProfileId])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    void (async () => {
      try {
        const status = await getRuntimeLLMConfigStatus()
        if (cancelled) return
        setRuntimeHasApiKey(Boolean(status?.hasApiKey))
      } catch {
        if (cancelled) return
        setRuntimeHasApiKey(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, llmSettings.activeProfileId])

  if (!open || !selectedProfile) return null

  const hasStoredApiKey = resolvedSecretHasApiKey ?? selectedProfile.secret.hasApiKey
  const isSelectedProfileActive = selectedProfile.id === llmSettings.activeProfileId
  const hasRuntimeApiKeyForSelected = isSelectedProfileActive && Boolean(runtimeHasApiKey)
  const hasEffectiveApiKey = hasStoredApiKey || hasRuntimeApiKeyForSelected

  const hasApiKeyForProfile = (profileId: string): boolean => {
    const profile = llmSettings.profiles.find((item) => item.id === profileId)
    if (!profile) return false
    if (profile.id === selectedProfile.id) {
      return resolvedSecretHasApiKey ?? profile.secret.hasApiKey
    }
    if (profile.id === llmSettings.activeProfileId && runtimeHasApiKey) {
      return true
    }
    return profile.secret.hasApiKey
  }

  const isProfileReady = (profileId: string): boolean => {
    const profile = llmSettings.profiles.find((item) => item.id === profileId)
    if (!profile) return false
    const hasApiKey = hasApiKeyForProfile(profileId)
    return Boolean(profile.config.baseURL.trim() && profile.config.model.trim() && hasApiKey)
  }

  const parseNumber = (
    value: string,
    fallback: number,
    min: number,
    max: number,
    integer: boolean = false
  ): number => {
    const parsed = integer ? parseInt(value, 10) : Number(value)
    if (!Number.isFinite(parsed)) return fallback
    const normalized = Math.max(min, Math.min(max, parsed))
    return integer ? Math.round(normalized) : normalized
  }

  const handlePromptLocaleChange = (nextLocale: LocaleCode) => {
    setPromptLocale(nextLocale)
    syncPromptFieldsByLocale(nextLocale)
    setPreviewInput(getDefaultPreviewInput(nextLocale))
    setPreviewContextXml(getDefaultPreviewContextXml(nextLocale))
  }

  const loadModelOptions = async (silent: boolean = false) => {
    if (!selectedProfile) return

    const draftProfile = {
      ...selectedProfile,
      config: {
        ...selectedProfile.config,
        baseURL: baseURL.trim(),
        modelsPath: modelsPath.trim(),
        model: model.trim(),
        apiStyle
      }
    }

    if (!draftProfile.config.baseURL) {
      if (!silent) showToast(t('settings.toast.modelsNeedBaseUrl'), 'error')
      return
    }

    if (!apiKeyInput.trim() && !hasEffectiveApiKey) {
      if (!silent) showToast(t('settings.toast.modelsNeedConfig'), 'error')
      return
    }

    setIsLoadingModels(true)
    try {
      const result = await fetchProfileModels(draftProfile, apiKeyInput.trim() || undefined)
      const models = Array.from(new Set((result.models || []).map((item) => item.trim()).filter(Boolean)))
      setModelOptions(models)
      setLLMProfileModelOptionsCache(selectedProfile.id, models)
      if (!silent) {
        showToast(t('settings.toast.modelsLoaded', { count: models.length }), 'success')
      }
    } catch (error) {
      if (!silent) {
        const message = error instanceof Error ? error.message : t('settings.toast.modelsLoadUnknown')
        showToast(t('settings.toast.modelsLoadFailed', { message }), 'error')
      }
    } finally {
      setIsLoadingModels(false)
    }
  }

  const handleCreateProfile = () => {
    const createdId = createLLMProfile()
    setSelectedProfileId(createdId)
    setIsProfileEditorOpen(true)
    showToast(t('settings.toast.profileCreated'), 'success')
  }

  const handleOpenProfileEditor = (profileId: string) => {
    setSelectedProfileId(profileId)
    setIsProfileEditorOpen(true)
  }

  const handleDeleteProfile = (profileId: string) => {
    if (llmSettings.profiles.length <= 1) {
      showToast(t('settings.toast.profileDeleteLastBlocked'), 'error')
      return
    }

    const confirmed = window.confirm(t('settings.profile.deleteConfirm'))
    if (!confirmed) return

    const deletingId = profileId
    deleteLLMProfile(deletingId)

    const nextState = useSettingsStore.getState().llmSettings
    const fallbackSelected = nextState.profiles.find((profile) => profile.id !== deletingId) || nextState.profiles[0]
    if (fallbackSelected) {
      setSelectedProfileId(fallbackSelected.id)
    }
    if (selectedProfileId === deletingId) {
      setIsProfileEditorOpen(false)
    }

    showToast(t('settings.toast.profileDeleted'), 'success')
  }

  const handleActivateProfile = async (profileId: string) => {
    if (profileId === llmSettings.activeProfileId) return
    const profile = getLLMProfileById(llmSettings, profileId)
    if (!profile) return

    setSwitchingProfileId(profileId)
    try {
      await syncProfileToRuntime(llmSettings, profile)
      setActiveLLMProfile(profile.id)
      showToast(t('settings.toast.profileActivated', { name: profile.name }), 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.toast.modelsLoadUnknown')
      showToast(t('settings.toast.profileActivateFailed', { message }), 'error')
    } finally {
      setSwitchingProfileId('')
    }
  }

  const handleSaveProfile = async () => {
    if (!selectedProfile) return
    const nextName = profileNameInput.trim()

    setIsSavingProfile(true)

    const nextTemperature = parseNumber(temperature, selectedProfile.config.temperature, 0, 2)
    const nextMaxTokens = parseNumber(maxTokens, selectedProfile.config.maxTokens, 1, UNBOUNDED_MAX_TOKENS, true)
    const nextBaseURL = baseURL.trim()
    const nextModelsPath = modelsPath.trim()
    const nextModel = model.trim()

    if (nextName && nextName !== selectedProfile.name) {
      renameLLMProfile(selectedProfile.id, nextName)
      showToast(t('settings.toast.profileRenamed'), 'success')
    }

    updateLLMProfileConfig(selectedProfile.id, {
      baseURL: nextBaseURL,
      modelsPath: nextModelsPath,
      model: nextModel,
      apiStyle,
      temperature: nextTemperature,
      maxTokens: nextMaxTokens
    })

    try {
      const hasFreshApiKey = apiKeyInput.trim().length > 0
      const shouldClear = clearApiKeyOnSave && !hasFreshApiKey

      if (shouldClear) {
        await removeSecret(selectedProfile.secret.secretId)
      }

      let provider = selectedProfile.secret.provider
      if (hasFreshApiKey) {
        provider = await setSecret(selectedProfile.secret.secretId, apiKeyInput.trim())
      }

      const nextHasApiKey = shouldClear ? false : hasStoredApiKey || hasFreshApiKey

      updateLLMProfileSecret(selectedProfile.id, {
        provider,
        hasApiKey: nextHasApiKey,
        updatedAt: new Date().toISOString()
      })
      setResolvedSecretHasApiKey(nextHasApiKey)

      setLLMProfileModelOptionsCache(selectedProfile.id, modelOptions)

      const nextSettings = useSettingsStore.getState().llmSettings
      const nextSelectedProfile = getLLMProfileById(nextSettings, selectedProfile.id)
      const shouldSyncRuntime = nextSelectedProfile && nextSettings.activeProfileId === selectedProfile.id

      let runtimeSyncErrorMessage = ''
      if (shouldSyncRuntime && nextSelectedProfile) {
        try {
          await syncProfileToRuntime(nextSettings, nextSelectedProfile)
        } catch (error) {
          runtimeSyncErrorMessage = error instanceof Error ? error.message : t('settings.toast.modelsLoadUnknown')
          if (runtimeSyncErrorMessage.includes('API Key is missing')) {
            updateLLMProfileSecret(selectedProfile.id, {
              hasApiKey: false,
              updatedAt: new Date().toISOString()
            })
            setResolvedSecretHasApiKey(false)
          }
        }
      }

      setApiKeyInput('')
      setClearApiKeyOnSave(false)
      setIsProfileEditorOpen(false)
      showToast(t('settings.toast.saved'), 'success')
      if (runtimeSyncErrorMessage) {
        showToast(`${t('settings.toast.localSavedRemoteFailed')}: ${runtimeSyncErrorMessage}`, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.toast.modelsLoadUnknown')
      showToast(t('settings.toast.saveFailed', { message }), 'error')
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleSave = async () => {
    if (!selectedProfile) return
    setIsSaving(true)

    const nextContextMaxDepth = parseNumber(contextMaxDepth, llmSettings.contextMaxDepth, 1, 50, true)
    const nextAnswerAnchorKeywords = answerAnchorKeywordsText
      .split(/[\r\n,，]+/)
      .map((item) => item.trim())
      .filter(Boolean)

    const resolvedAnswerAnchorKeywords = nextAnswerAnchorKeywords.length > 0
      ? Array.from(new Set(nextAnswerAnchorKeywords))
      : DEFAULT_ANSWER_ANCHOR_KEYWORDS_BY_LOCALE[promptLocale]

    const nextSystemPrompt = systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT_BY_LOCALE[promptLocale]

    const nextPromptTemplates = {
      directExpand: directExpandPrompt.trim() || DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].directExpand,
      targetedQuestion: targetedPrompt.trim() || DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].targetedQuestion,
      contextEnvelope: contextEnvelopePrompt.trim() || DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].contextEnvelope
    }

    try {
      updateLLMSettings({
        promptLocale,
        contextMaxDepth: nextContextMaxDepth,
        answerAnchorKeywords: resolvedAnswerAnchorKeywords,
        systemPrompt: nextSystemPrompt,
        promptTemplates: nextPromptTemplates
      })
      setTheme(themeMode)
      setLocaleMode(localeMode)
      showToast(t('settings.toast.saved'), 'success')
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.toast.modelsLoadUnknown')
      showToast(t('settings.toast.saveFailed', { message }), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50"
      style={{ zIndex: Z_INDEX.settingsModal }}
      onClick={onClose}
    >
      <div className="bg-background text-foreground rounded-lg border border-border shadow-lg w-[820px] max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 inline-flex rounded-lg border border-border bg-muted/30 p-1">
          <button
            onClick={() => setActiveTab('llm')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'llm' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('settings.tab.llm')}
          </button>
          <button
            onClick={() => setActiveTab('prompt')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'prompt' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('settings.tab.prompt')}
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'appearance' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('settings.tab.appearance')}
          </button>
        </div>

        <div className="space-y-5">
          {activeTab === 'llm' && (
            <div className="rounded border border-border p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{t('settings.profile.section')}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{t('settings.profile.manageHint')}</p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateProfile}
                  className="px-3 py-2 border border-border rounded hover:bg-accent text-sm inline-flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  {t('settings.profile.create')}
                </button>
              </div>

              <input
                type="text"
                value={profileSearchKeyword}
                onChange={(e) => setProfileSearchKeyword(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={t('settings.profile.searchPlaceholder')}
              />

              <div className="border border-border rounded overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  {filteredProfiles.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">{t('settings.profile.empty')}</div>
                  ) : (
                    filteredProfiles.map((profile) => {
                      const isActive = profile.id === llmSettings.activeProfileId
                      const isSelected = profile.id === selectedProfile.id
                      const isSwitching = switchingProfileId === profile.id
                      const ready = isProfileReady(profile.id)
                      const readyLabel = ready
                        ? t('settings.profile.status.ready')
                        : t('settings.profile.status.notReady')

                      return (
                        <div
                          key={profile.id}
                          className={`border-b border-border/60 last:border-b-0 p-3 flex items-start justify-between gap-3 ${
                            isSelected ? 'bg-accent/35' : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedProfileId(profile.id)}
                            className="min-w-0 text-left flex-1"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-block w-2 h-2 rounded-full ${ready ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                title={readyLabel}
                                aria-label={readyLabel}
                              />
                              <span className="text-sm font-medium truncate">{profile.name}</span>
                              {isActive && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                                  {t('common.current')}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground truncate">
                              {profile.config.model || '-'}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                              {profile.config.apiStyle} · {profile.config.baseURL || '-'}
                            </div>
                          </button>

                          <div className="shrink-0 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenProfileEditor(profile.id)}
                              className={RESET_BUTTON_CLASS}
                            >
                              {t('settings.profile.edit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleActivateProfile(profile.id)}
                              disabled={isActive || Boolean(switchingProfileId)}
                              className={`${RESET_BUTTON_CLASS} disabled:opacity-50`}
                            >
                              {isSwitching
                                ? t('settings.profile.switching')
                                : isActive
                                  ? t('settings.profile.active')
                                  : t('settings.profile.setActive')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProfile(profile.id)}
                              disabled={llmSettings.profiles.length <= 1}
                              className={`${RESET_BUTTON_CLASS} disabled:opacity-50`}
                              aria-label={t('settings.profile.delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'prompt' && (
            <>
              <div className="rounded border border-border p-3 space-y-2">
                <div className="text-sm font-medium">{t('settings.section.context')}</div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('settings.promptLocale')}</label>
                  <select
                    value={promptLocale}
                    onChange={(e) => handlePromptLocaleChange(e.target.value as LocaleCode)}
                    className="w-[220px] px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="zh-CN">{t('settings.promptLocale.zh')}</option>
                    <option value="en-US">{t('settings.promptLocale.en')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('settings.contextDepth')}</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    value={contextMaxDepth}
                    onChange={(e) => setContextMaxDepth(e.target.value)}
                    className="w-[220px] px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t('settings.contextDepth.help')}</p>
                </div>
                <div className="pt-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">{t('settings.answerAnchors')}</label>
                    <button
                      type="button"
                      onClick={() => setAnswerAnchorKeywordsText(DEFAULT_ANSWER_ANCHOR_KEYWORDS_BY_LOCALE[promptLocale].join('\n'))}
                      className={RESET_BUTTON_CLASS}
                    >
                      {t('settings.prompt.resetDefaults')}
                    </button>
                  </div>
                  <textarea
                    value={answerAnchorKeywordsText}
                    onChange={(e) => setAnswerAnchorKeywordsText(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y font-mono text-xs"
                    placeholder={promptLocale === 'zh-CN' ? '结论' : 'Conclusion'}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t('settings.answerAnchors.help')}</p>
                </div>
              </div>

              <div className="rounded border border-border p-3 space-y-3">
                <div className="text-sm font-medium">{t('settings.section.promptCustom')}</div>
                <div className="rounded border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <div className="text-sm font-medium">{t('settings.template.flowTitle')}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5">
                      {t('settings.template.step', { index: 1 })} · {t('settings.systemPrompt')}
                    </span>
                    <span>→</span>
                    <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5">
                      {t('settings.template.step', { index: 2 })} · {t('settings.template.contextEnvelope')}
                    </span>
                    <span>→</span>
                    <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5">
                      {t('settings.template.step', { index: 3 })} · {t('settings.template.promptExpandGroup')}
                    </span>
                  </div>
                  <div className="rounded border border-border bg-background/80 px-2 py-1.5 text-xs font-mono text-muted-foreground">
                    {t('settings.template.flowFormula')}
                  </div>
                </div>
                <div className="rounded border border-border p-3 space-y-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {t('settings.template.step', { index: 1 })}
                      </span>
                      <label className="text-sm font-medium">{t('settings.systemPrompt')}</label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT_BY_LOCALE[promptLocale])}
                      className={RESET_BUTTON_CLASS}
                    >
                      {t('settings.prompt.resetDefaults')}
                    </button>
                  </div>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y font-mono text-xs"
                    placeholder={t('settings.systemPrompt.placeholder')}
                  />
                </div>

                <div className="border-t border-border pt-4 space-y-4">
                  <div className="rounded border border-border p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {t('settings.template.step', { index: 2 })}
                        </span>
                        <label className="text-sm font-medium">{t('settings.template.contextEnvelope')}</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openPreview('context_envelope')}
                          className={RESET_BUTTON_CLASS}
                        >
                          {t('settings.preview.open')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setContextEnvelopePrompt(DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].contextEnvelope)}
                          className={RESET_BUTTON_CLASS}
                        >
                          {t('settings.prompt.resetDefaults')}
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={contextEnvelopePrompt}
                      onChange={(e) => setContextEnvelopePrompt(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y font-mono text-xs"
                    />
                  </div>

                  <div className="rounded border border-border p-3 space-y-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {t('settings.template.step', { index: 3 })}
                        </span>
                        <div className="text-sm font-medium">{t('settings.template.promptExpandGroup')}</div>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{t('settings.template.promptExpandGroup.help')}</div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="text-sm font-medium">{t('settings.template.direct')}</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openPreview('direct')}
                            className={RESET_BUTTON_CLASS}
                          >
                            {t('settings.preview.open')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDirectExpandPrompt(DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].directExpand)}
                            className={RESET_BUTTON_CLASS}
                          >
                            {t('settings.prompt.resetDefaults')}
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={directExpandPrompt}
                        onChange={(e) => setDirectExpandPrompt(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y font-mono text-xs"
                      />
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="text-sm font-medium">{t('settings.template.targeted')}</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openPreview('targeted')}
                            className={RESET_BUTTON_CLASS}
                          >
                            {t('settings.preview.open')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTargetedPrompt(DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].targetedQuestion)}
                            className={RESET_BUTTON_CLASS}
                          >
                            {t('settings.prompt.resetDefaults')}
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={targetedPrompt}
                        onChange={(e) => setTargetedPrompt(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y font-mono text-xs"
                      />
                    </div>

                  </div>
                </div>
              </div>

            </>
          )}

          {activeTab === 'appearance' && (
            <div className="rounded border border-border p-3 space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">{t('settings.section.theme')}</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setThemeMode('light')}
                    className={`px-3 py-3 rounded border text-sm text-left transition-colors ${
                      themeMode === 'light'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border hover:bg-accent text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4" />
                      {t('settings.theme.light')}
                    </div>
                  </button>
                  <button
                    onClick={() => setThemeMode('dark')}
                    className={`px-3 py-3 rounded border text-sm text-left transition-colors ${
                      themeMode === 'dark'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border hover:bg-accent text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Moon className="w-4 h-4" />
                      {t('settings.theme.dark')}
                    </div>
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t('settings.theme.help')}</p>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">{t('settings.section.language')}</div>
                <label className="block text-sm font-medium mb-1">{t('settings.language.mode')}</label>
                <select
                  value={localeMode}
                  onChange={(e) => setLocaleModeState(e.target.value as LocaleMode)}
                  className="w-[220px] px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="auto">{t('settings.language.mode.auto')}</option>
                  <option value="zh-CN">{t('settings.language.mode.zh')}</option>
                  <option value="en-US">{t('settings.language.mode.en')}</option>
                </select>
                <p className="mt-2 text-xs text-muted-foreground">{t('settings.language.help')}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded hover:bg-accent">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-60"
          >
            {isSaving ? t('common.generating') : t('common.save')}
          </button>
        </div>
      </div>

      {previewSource && previewRendered && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/40"
          style={{ zIndex: Z_INDEX.settingsPreviewModal }}
          onClick={(e) => {
            e.stopPropagation()
            setPreviewSource(null)
          }}
        >
          <div
            className="w-[920px] max-w-[96vw] max-h-[90vh] overflow-y-auto bg-background border border-border rounded-lg shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{previewRendered.title} · {t('settings.preview.section')}</div>
                <div className="text-xs text-muted-foreground">{t('settings.preview.description')}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyPromptPreview()}
                  className={RESET_BUTTON_CLASS}
                >
                  <span className="inline-flex items-center gap-1">
                    <Copy className="w-3.5 h-3.5" />
                    {t('settings.preview.copy')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewSource(null)}
                  className="p-1 rounded hover:bg-accent"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">{t('settings.preview.input')}</label>
                <textarea
                  value={previewInput}
                  onChange={(e) => setPreviewInput(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                  placeholder={t('settings.preview.input.placeholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('settings.preview.contextXml')}</label>
                <textarea
                  value={previewContextXml}
                  onChange={(e) => setPreviewContextXml(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y font-mono text-xs"
                  placeholder={t('settings.preview.contextXml.placeholder')}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">{t('settings.preview.systemPrompt')}</div>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/20 p-2 text-xs leading-relaxed">{previewRendered.systemPrompt}</pre>
              </div>
              {previewRendered.userPrompts.map((item) => (
                <div key={item.mode}>
                  <div className="mb-1 text-xs text-muted-foreground">
                    {t('settings.preview.userPrompt')} · {item.label}
                  </div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/20 p-2 text-xs leading-relaxed">{item.content}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isProfileEditorOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/40"
          style={{ zIndex: Z_INDEX.settingsProfileEditorModal }}
          onClick={(e) => {
            e.stopPropagation()
            setIsProfileEditorOpen(false)
          }}
        >
          <div
            className="w-[760px] max-w-[94vw] max-h-[90vh] overflow-y-auto bg-background border border-border rounded-lg shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t('settings.profile.editTitle')}</div>
                <div className="text-xs text-muted-foreground">{t('settings.profile.editDescription')}</div>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileEditorOpen(false)}
                className="p-1 rounded hover:bg-accent"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('settings.profile.namePlaceholder')}</label>
                <input
                  type="text"
                  value={profileNameInput}
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={t('settings.profile.namePlaceholder')}
                />
              </div>

              <div className="rounded border border-border p-3 space-y-3">
                <div className="text-sm font-medium">{t('settings.section.basic')}</div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-sm font-medium">{t('settings.apiKey')}</label>
                    <span className="text-xs text-muted-foreground">
                      {clearApiKeyOnSave
                        ? t('settings.apiKey.clearPending')
                        : hasStoredApiKey
                          ? t('settings.apiKey.saved')
                          : hasRuntimeApiKeyForSelected
                            ? t('settings.apiKey.runtimeLoaded')
                          : t('settings.apiKey.empty')}
                    </span>
                  </div>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value)
                      if (e.target.value.trim()) setClearApiKeyOnSave(false)
                    }}
                    className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder={t('settings.apiKey.placeholder')}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setApiKeyInput('')
                        setClearApiKeyOnSave(true)
                      }}
                      className={RESET_BUTTON_CLASS}
                    >
                      {t('settings.apiKey.clear')}
                    </button>
                    <p className="text-xs text-muted-foreground">{t('settings.apiKey.help')}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">{t('settings.baseUrl')}</label>
                  <input
                    type="text"
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="https://api.openai.com/v1"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-sm font-medium">{t('settings.model')}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={modelsPath}
                        onChange={(e) => setModelsPath(e.target.value)}
                        className="h-8 w-[220px] max-w-[40vw] px-2 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        aria-label={t('settings.model.path')}
                        placeholder={t('settings.model.path.placeholder')}
                      />
                      <div className="relative">
                        <button
                          type="button"
                          className="h-6 w-6 rounded-full border border-border text-xs text-muted-foreground hover:bg-accent"
                          aria-label={t('settings.model.path.help')}
                          aria-describedby={showModelsPathHelp ? 'models-path-help-tooltip' : undefined}
                          onMouseEnter={() => setShowModelsPathHelp(true)}
                          onMouseLeave={() => setShowModelsPathHelp(false)}
                          onFocus={() => setShowModelsPathHelp(true)}
                          onBlur={() => setShowModelsPathHelp(false)}
                          onClick={() => setShowModelsPathHelp((prev) => !prev)}
                        >
                          ?
                        </button>
                        {showModelsPathHelp && (
                          <div
                            id="models-path-help-tooltip"
                            role="tooltip"
                            className="absolute right-0 top-full mt-1 w-[320px] max-w-[70vw] rounded border border-border bg-background px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground shadow-lg"
                            style={{ zIndex: Z_INDEX.settingsTooltip }}
                          >
                            {t('settings.model.path.help')}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowModelsPathHelp(false)
                          void loadModelOptions()
                        }}
                        className={RESET_BUTTON_CLASS}
                        disabled={isLoadingModels}
                      >
                        {isLoadingModels ? t('settings.model.fetching') : t('settings.model.fetch')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowModelsPathHelp(false)
                          setIsModelLibraryOpen(true)
                        }}
                        className={RESET_BUTTON_CLASS}
                      >
                        {t('settings.model.library.open')}
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value)
                      setModelSearchKeyword(e.target.value)
                    }}
                    className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="gpt-5"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {modelOptions.length > 0
                      ? t('settings.model.loaded', { count: modelOptions.length })
                      : t('settings.model.help')}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">{t('settings.apiStyle')}</label>
                  <select
                    value={apiStyle}
                    onChange={(e) => setApiStyle(e.target.value as ApiStyle)}
                    className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="openai_chat">{t('settings.apiStyle.openai')}</option>
                    <option value="openai_response">{t('settings.apiStyle.openaiResponse')}</option>
                    <option value="anthropic">{t('settings.apiStyle.anthropic')}</option>
                    <option value="google_gemini">{t('settings.apiStyle.google')}</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">{t('settings.apiStyle.help')}</p>
                </div>
              </div>

              <div className="rounded border border-border p-3 space-y-3">
                <div className="text-sm font-medium">{t('settings.section.advanced')}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('settings.temperature')}</label>
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('settings.maxTokens')}</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsProfileEditorOpen(false)}
                className="px-4 py-2 border border-border rounded hover:bg-accent"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveProfile()}
                disabled={isSavingProfile}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {isSavingProfile ? t('common.generating') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isProfileEditorOpen && isModelLibraryOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/40"
          style={{ zIndex: Z_INDEX.settingsModelLibraryModal }}
          onClick={(e) => {
            e.stopPropagation()
            setIsModelLibraryOpen(false)
          }}
        >
          <div className="w-[680px] max-w-[92vw] bg-background border border-border rounded-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t('settings.model.library.title')}</div>
                <div className="text-xs text-muted-foreground">
                  {t('settings.model.filtered', {
                    shown: filteredModelOptions.length,
                    total: modelOptions.length
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModelLibraryOpen(false)}
                className="p-1 rounded hover:bg-accent"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <input
                type="text"
                value={modelSearchKeyword}
                onChange={(e) => setModelSearchKeyword(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={t('settings.model.library.searchPlaceholder')}
              />

              <div className="max-h-[360px] overflow-auto border border-border rounded">
                {filteredModelOptions.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">{t('settings.model.noMatch')}</div>
                ) : (
                  filteredModelOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setModel(item)
                        setModelSearchKeyword(item)
                        setIsModelLibraryOpen(false)
                      }}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-border/60 last:border-b-0 transition-colors ${
                        item === model ? 'bg-accent text-foreground' : 'text-foreground hover:bg-accent/60'
                      }`}
                    >
                      {item}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
