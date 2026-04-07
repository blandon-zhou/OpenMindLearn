import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_ANSWER_ANCHOR_KEYWORDS_BY_LOCALE,
  DEFAULT_PROMPT_TEMPLATES_BY_LOCALE,
  DEFAULT_SYSTEM_PROMPT_BY_LOCALE,
  type ApiStyle,
  type ThemeMode,
  useSettingsStore
} from '../stores/settingsStore'
import type { LocaleCode, LocaleMode } from '../i18n/types'
import { fetchProfileModels, getLLMProfileById, syncProfileToRuntime } from '../services/profileRuntime'
import { removeSecret, setSecret } from '../services/secureSecret'
import { useToastStore } from '../stores/toastStore'
import { Moon, Plus, Sun, Trash2, X } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

const RESET_BUTTON_CLASS = 'px-2.5 py-1 text-xs rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors'

function getLocalePromptConfig(llmSettings: ReturnType<typeof useSettingsStore.getState>['llmSettings'], locale: LocaleCode) {
  return llmSettings.localizedPrompts[locale] || {
    systemPrompt: DEFAULT_SYSTEM_PROMPT_BY_LOCALE[locale],
    promptTemplates: DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[locale],
    answerAnchorKeywords: DEFAULT_ANSWER_ANCHOR_KEYWORDS_BY_LOCALE[locale]
  }
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
  const [customContextPrompt, setCustomContextPrompt] = useState(llmSettings.promptTemplates.customContextExpand)
  const [contextEnvelopePrompt, setContextEnvelopePrompt] = useState(llmSettings.promptTemplates.contextEnvelope)
  const [themeMode, setThemeMode] = useState<ThemeMode>(uiSettings.theme)
  const [localeMode, setLocaleModeState] = useState<LocaleMode>(uiSettings.localeMode)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [isModelLibraryOpen, setIsModelLibraryOpen] = useState(false)
  const [modelSearchKeyword, setModelSearchKeyword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSwitchingProfile, setIsSwitchingProfile] = useState(false)

  const selectedProfile = useMemo(() => {
    return llmSettings.profiles.find((profile) => profile.id === selectedProfileId) || llmSettings.profiles[0]
  }, [llmSettings.profiles, selectedProfileId])

  const filteredModelOptions = useMemo(() => {
    const keyword = modelSearchKeyword.trim().toLowerCase()
    if (!keyword) return modelOptions
    return modelOptions.filter((item) => item.toLowerCase().includes(keyword))
  }, [modelOptions, modelSearchKeyword])

  const syncPromptFieldsByLocale = (locale: LocaleCode) => {
    const localized = getLocalePromptConfig(llmSettings, locale)
    setSystemPrompt(localized.systemPrompt)
    setDirectExpandPrompt(localized.promptTemplates.directExpand)
    setTargetedPrompt(localized.promptTemplates.targetedQuestion)
    setCustomContextPrompt(localized.promptTemplates.customContextExpand)
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
    setIsModelLibraryOpen(false)
    setModelSearchKeyword('')
  }, [open, llmSettings.activeProfileId, llmSettings.promptLocale, llmSettings.contextMaxDepth, uiSettings.theme, uiSettings.localeMode])

  useEffect(() => {
    if (!open || !selectedProfile) return

    setProfileNameInput(selectedProfile.name)
    setApiKeyInput('')
    setClearApiKeyOnSave(false)
    setBaseURL(selectedProfile.config.baseURL)
    setModel(selectedProfile.config.model)
    setApiStyle(selectedProfile.config.apiStyle)
    setTemperature(String(selectedProfile.config.temperature))
    setMaxTokens(String(selectedProfile.config.maxTokens))
    setModelOptions(selectedProfile.modelOptionsCache || [])
    setModelSearchKeyword(selectedProfile.config.model)
  }, [open, selectedProfile])

  if (!open || !selectedProfile) return null

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
  }

  const loadModelOptions = async (silent: boolean = false) => {
    if (!selectedProfile) return

    const draftProfile = {
      ...selectedProfile,
      config: {
        ...selectedProfile.config,
        baseURL: baseURL.trim(),
        model: model.trim(),
        apiStyle
      }
    }

    if (!draftProfile.config.baseURL) {
      if (!silent) showToast(t('settings.toast.modelsNeedBaseUrl'), 'error')
      return
    }

    if (!apiKeyInput.trim() && !selectedProfile.secret.hasApiKey) {
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
    showToast(t('settings.toast.profileCreated'), 'success')
  }

  const handleRenameProfile = () => {
    const nextName = profileNameInput.trim()
    if (!nextName) {
      showToast(t('settings.toast.profileNameRequired'), 'error')
      return
    }
    renameLLMProfile(selectedProfile.id, nextName)
    showToast(t('settings.toast.profileRenamed'), 'success')
  }

  const handleDeleteProfile = () => {
    if (llmSettings.profiles.length <= 1) {
      showToast(t('settings.toast.profileDeleteLastBlocked'), 'error')
      return
    }

    const confirmed = window.confirm(t('settings.profile.deleteConfirm'))
    if (!confirmed) return

    const deletingId = selectedProfile.id
    deleteLLMProfile(deletingId)

    const nextState = useSettingsStore.getState().llmSettings
    const fallbackSelected = nextState.profiles.find((profile) => profile.id !== deletingId) || nextState.profiles[0]
    if (fallbackSelected) {
      setSelectedProfileId(fallbackSelected.id)
    }

    showToast(t('settings.toast.profileDeleted'), 'success')
  }

  const handleActivateSelectedProfile = async () => {
    if (selectedProfile.id === llmSettings.activeProfileId) return

    setIsSwitchingProfile(true)
    try {
      await syncProfileToRuntime(llmSettings, selectedProfile)
      setActiveLLMProfile(selectedProfile.id)
      showToast(t('settings.toast.profileActivated', { name: selectedProfile.name }), 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.toast.modelsLoadUnknown')
      showToast(t('settings.toast.profileActivateFailed', { message }), 'error')
    } finally {
      setIsSwitchingProfile(false)
    }
  }

  const handleSave = async () => {
    if (!selectedProfile) return
    setIsSaving(true)

    const nextTemperature = parseNumber(temperature, selectedProfile.config.temperature, 0, 2)
    const nextMaxTokens = parseNumber(maxTokens, selectedProfile.config.maxTokens, 1, 32000, true)
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
      customContextExpand: customContextPrompt.trim() || DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].customContextExpand,
      contextEnvelope: contextEnvelopePrompt.trim() || DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].contextEnvelope
    }

    const nextBaseURL = baseURL.trim()
    const nextModel = model.trim()

    updateLLMProfileConfig(selectedProfile.id, {
      baseURL: nextBaseURL,
      model: nextModel,
      apiStyle,
      temperature: nextTemperature,
      maxTokens: nextMaxTokens
    })

    updateLLMSettings({
      promptLocale,
      contextMaxDepth: nextContextMaxDepth,
      answerAnchorKeywords: resolvedAnswerAnchorKeywords,
      systemPrompt: nextSystemPrompt,
      promptTemplates: nextPromptTemplates
    })
    setTheme(themeMode)
    setLocaleMode(localeMode)

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

      updateLLMProfileSecret(selectedProfile.id, {
        provider,
        hasApiKey: shouldClear ? false : selectedProfile.secret.hasApiKey || hasFreshApiKey,
        updatedAt: new Date().toISOString()
      })

      setLLMProfileModelOptionsCache(selectedProfile.id, modelOptions)

      const nextSettings = useSettingsStore.getState().llmSettings
      const nextSelectedProfile = getLLMProfileById(nextSettings, selectedProfile.id)
      const shouldSyncRuntime = nextSelectedProfile && nextSettings.activeProfileId === selectedProfile.id

      if (shouldSyncRuntime && nextSelectedProfile) {
        await syncProfileToRuntime(nextSettings, nextSelectedProfile)
      }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
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
            <>
              <div className="rounded border border-border p-3 space-y-3">
                <div className="text-sm font-medium">{t('settings.profile.section')}</div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                  <select
                    value={selectedProfile.id}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                    className="px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {llmSettings.profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}{profile.id === llmSettings.activeProfileId ? ` (${t('common.current')})` : ''}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleCreateProfile}
                    className="px-3 py-2 border border-border rounded hover:bg-accent text-sm inline-flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    {t('settings.profile.create')}
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteProfile}
                    disabled={llmSettings.profiles.length <= 1}
                    className="px-3 py-2 border border-border rounded hover:bg-accent text-sm disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('settings.profile.delete')}
                  </button>
                </div>

                <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                  <input
                    type="text"
                    value={profileNameInput}
                    onChange={(e) => setProfileNameInput(e.target.value)}
                    className="px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder={t('settings.profile.namePlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={handleRenameProfile}
                    className="px-3 py-2 border border-border rounded hover:bg-accent text-sm"
                  >
                    {t('settings.profile.rename')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleActivateSelectedProfile()}
                    disabled={selectedProfile.id === llmSettings.activeProfileId || isSwitchingProfile}
                    className="px-3 py-2 border border-border rounded hover:bg-accent text-sm disabled:opacity-50"
                  >
                    {isSwitchingProfile
                      ? t('settings.profile.switching')
                      : selectedProfile.id === llmSettings.activeProfileId
                        ? t('settings.profile.active')
                        : t('settings.profile.setActive')}
                  </button>
                </div>
              </div>

              <div className="rounded border border-border p-3 space-y-3">
                <div className="text-sm font-medium">{t('settings.section.basic')}</div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-sm font-medium">{t('settings.apiKey')}</label>
                    <span className="text-xs text-muted-foreground">
                      {clearApiKeyOnSave
                        ? t('settings.apiKey.clearPending')
                        : selectedProfile.secret.hasApiKey
                          ? t('settings.apiKey.saved')
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
                      <button
                        type="button"
                        onClick={() => void loadModelOptions()}
                        className={RESET_BUTTON_CLASS}
                        disabled={isLoadingModels}
                      >
                        {isLoadingModels ? t('settings.model.fetching') : t('settings.model.fetch')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsModelLibraryOpen(true)}
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
                      max={32000}
                      step={1}
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            </>
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
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">{t('settings.systemPrompt')}</label>
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
                    className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                    placeholder={t('settings.systemPrompt.placeholder')}
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">{t('settings.template.direct')}</label>
                    <button
                      type="button"
                      onClick={() => setDirectExpandPrompt(DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].directExpand)}
                      className={RESET_BUTTON_CLASS}
                    >
                      {t('settings.prompt.resetDefaults')}
                    </button>
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
                    <button
                      type="button"
                      onClick={() => setTargetedPrompt(DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].targetedQuestion)}
                      className={RESET_BUTTON_CLASS}
                    >
                      {t('settings.prompt.resetDefaults')}
                    </button>
                  </div>
                  <textarea
                    value={targetedPrompt}
                    onChange={(e) => setTargetedPrompt(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y font-mono text-xs"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">{t('settings.template.customContext')}</label>
                    <button
                      type="button"
                      onClick={() => setCustomContextPrompt(DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].customContextExpand)}
                      className={RESET_BUTTON_CLASS}
                    >
                      {t('settings.prompt.resetDefaults')}
                    </button>
                  </div>
                  <textarea
                    value={customContextPrompt}
                    onChange={(e) => setCustomContextPrompt(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y font-mono text-xs"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">{t('settings.template.contextEnvelope')}</label>
                    <button
                      type="button"
                      onClick={() => setContextEnvelopePrompt(DEFAULT_PROMPT_TEMPLATES_BY_LOCALE[promptLocale].contextEnvelope)}
                      className={RESET_BUTTON_CLASS}
                    >
                      {t('settings.prompt.resetDefaults')}
                    </button>
                  </div>
                  <textarea
                    value={contextEnvelopePrompt}
                    onChange={(e) => setContextEnvelopePrompt(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y font-mono text-xs"
                  />
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

      {isModelLibraryOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setIsModelLibraryOpen(false)}>
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
