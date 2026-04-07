import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_ANSWER_ANCHOR_KEYWORDS_BY_LOCALE,
  DEFAULT_PROMPT_TEMPLATES_BY_LOCALE,
  DEFAULT_SYSTEM_PROMPT_BY_LOCALE,
  type ApiStyle,
  type ThemeMode,
  useSettingsStore
} from '../stores/settingsStore'
import type { LocaleCode, LocaleMode } from '../i18n/types'
import { listAvailableModels, updateLLMConfig } from '../services/api'
import { useToastStore } from '../stores/toastStore'
import { Moon, Sun, X } from 'lucide-react'
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
  const { llmSettings, uiSettings, updateLLMSettings, setTheme, setLocaleMode } = useSettingsStore()
  const { showToast } = useToastStore()
  const { t } = useI18n()

  const [activeTab, setActiveTab] = useState<'llm' | 'prompt' | 'appearance'>('llm')
  const [apiKey, setApiKey] = useState(llmSettings.apiKey)
  const [baseURL, setBaseURL] = useState(llmSettings.baseURL)
  const [model, setModel] = useState(llmSettings.model)
  const [apiStyle, setApiStyle] = useState<ApiStyle>(llmSettings.apiStyle)
  const [temperature, setTemperature] = useState(String(llmSettings.temperature))
  const [maxTokens, setMaxTokens] = useState(String(llmSettings.maxTokens))
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
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false)
  const [activeModelIndex, setActiveModelIndex] = useState(0)
  const modelPickerRef = useRef<HTMLDivElement | null>(null)

  const filteredModelOptions = useMemo(() => {
    const keyword = model.trim().toLowerCase()
    if (!keyword) return modelOptions
    return modelOptions.filter((item) => item.toLowerCase().includes(keyword))
  }, [model, modelOptions])

  const loadModelOptions = async (
    config?: Partial<{ apiKey: string; baseURL: string; apiStyle: ApiStyle }>,
    silent: boolean = false
  ) => {
    const nextApiKey = (config?.apiKey ?? apiKey).trim()
    const nextBaseURL = (config?.baseURL ?? baseURL).trim()
    const nextApiStyle = config?.apiStyle ?? apiStyle

    if (!nextApiKey || !nextBaseURL) {
      if (!silent) showToast(t('settings.toast.modelsNeedConfig'), 'error')
      return
    }

    setIsLoadingModels(true)
    try {
      const result = await listAvailableModels({
        apiKey: nextApiKey,
        baseURL: nextBaseURL,
        apiStyle: nextApiStyle
      })
      const models = Array.from(new Set((result.models || []).map((item) => item.trim()).filter(Boolean)))
      setModelOptions(models)
      setActiveModelIndex(0)
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
    setApiKey(llmSettings.apiKey)
    setBaseURL(llmSettings.baseURL)
    setModel(llmSettings.model)
    setApiStyle(llmSettings.apiStyle)
    setTemperature(String(llmSettings.temperature))
    setMaxTokens(String(llmSettings.maxTokens))
    setContextMaxDepth(String(llmSettings.contextMaxDepth))
    setPromptLocale(llmSettings.promptLocale)
    syncPromptFieldsByLocale(llmSettings.promptLocale)
    setThemeMode(uiSettings.theme)
    setLocaleModeState(uiSettings.localeMode)
    setModelOptions([])
    setIsModelDropdownOpen(false)
    setActiveModelIndex(0)
    void loadModelOptions({
      apiKey: llmSettings.apiKey,
      baseURL: llmSettings.baseURL,
      apiStyle: llmSettings.apiStyle
    }, true)
  }, [llmSettings, open, uiSettings.theme, uiSettings.localeMode])

  useEffect(() => {
    if (!open || !isModelDropdownOpen) return

    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (!modelPickerRef.current?.contains(target)) {
        setIsModelDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
    }
  }, [isModelDropdownOpen, open])

  useEffect(() => {
    if (activeModelIndex >= filteredModelOptions.length) {
      setActiveModelIndex(0)
    }
  }, [activeModelIndex, filteredModelOptions.length])

  if (!open) return null

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

  const selectModelOption = (value: string) => {
    setModel(value)
    setIsModelDropdownOpen(false)
  }

  const handleSave = async () => {
    const nextTemperature = parseNumber(temperature, llmSettings.temperature, 0, 2)
    const nextMaxTokens = parseNumber(maxTokens, llmSettings.maxTokens, 1, 32000, true)
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

    updateLLMSettings({
      apiKey,
      baseURL,
      model,
      apiStyle,
      promptLocale,
      answerAnchorKeywords: resolvedAnswerAnchorKeywords,
      temperature: nextTemperature,
      maxTokens: nextMaxTokens,
      contextMaxDepth: nextContextMaxDepth,
      systemPrompt: nextSystemPrompt,
      promptTemplates: nextPromptTemplates
    })
    setTheme(themeMode)
    setLocaleMode(localeMode)

    try {
      await updateLLMConfig({
        apiKey,
        baseURL,
        model,
        apiStyle,
        answerAnchorKeywords: resolvedAnswerAnchorKeywords,
        temperature: nextTemperature,
        maxTokens: nextMaxTokens,
        contextMaxDepth: nextContextMaxDepth,
        systemPrompt: nextSystemPrompt,
        promptTemplates: nextPromptTemplates
      })
      showToast(t('settings.toast.saved'), 'success')
    } catch (error) {
      showToast(t('settings.toast.localSavedRemoteFailed'), 'error')
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background text-foreground rounded-lg border border-border shadow-lg w-[760px] max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
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
                <div className="text-sm font-medium">{t('settings.section.basic')}</div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('settings.apiKey')}</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder={t('settings.apiKey.placeholder')}
                  />
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
                    <button
                      type="button"
                      onClick={() => void loadModelOptions()}
                      className={RESET_BUTTON_CLASS}
                      disabled={isLoadingModels}
                    >
                      {isLoadingModels ? t('settings.model.fetching') : t('settings.model.fetch')}
                    </button>
                  </div>
                  <div ref={modelPickerRef} className="relative">
                    <input
                      type="text"
                      value={model}
                      onFocus={() => setIsModelDropdownOpen(true)}
                      onChange={(e) => {
                        setModel(e.target.value)
                        setActiveModelIndex(0)
                        setIsModelDropdownOpen(true)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setIsModelDropdownOpen(false)
                          return
                        }

                        if (filteredModelOptions.length === 0) {
                          if (e.key === 'ArrowDown') {
                            setIsModelDropdownOpen(true)
                          }
                          return
                        }

                        if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          setIsModelDropdownOpen(true)
                          setActiveModelIndex((prev) => (prev + 1) % filteredModelOptions.length)
                          return
                        }

                        if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          setIsModelDropdownOpen(true)
                          setActiveModelIndex((prev) => (prev - 1 + filteredModelOptions.length) % filteredModelOptions.length)
                          return
                        }

                        if (e.key === 'Enter' && isModelDropdownOpen) {
                          e.preventDefault()
                          const active = filteredModelOptions[activeModelIndex]
                          if (active) selectModelOption(active)
                        }
                      }}
                      className="w-full px-3 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Gemini-3.1-Pro"
                    />
                    {isModelDropdownOpen && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-background shadow-lg">
                        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
                          {t('settings.model.filtered', {
                            shown: filteredModelOptions.length,
                            total: modelOptions.length
                          })}
                        </div>
                        <div className="max-h-56 overflow-auto">
                          {filteredModelOptions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              {t('settings.model.noMatch')}
                            </div>
                          ) : (
                            filteredModelOptions.map((item, index) => (
                              <button
                                key={item}
                                type="button"
                                onClick={() => selectModelOption(item)}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                  index === activeModelIndex
                                    ? 'bg-accent text-foreground'
                                    : 'text-foreground hover:bg-accent/60'
                                }`}
                              >
                                {item}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
                <div className="text-sm font-medium">{t('settings.section.project')}</div>
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
                </div>
                <p className="text-xs text-muted-foreground">{t('settings.contextDepth.help')}</p>
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
          <button onClick={handleSave} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
