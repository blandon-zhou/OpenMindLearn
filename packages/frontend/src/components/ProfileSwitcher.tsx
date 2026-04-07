import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { getLLMProfileById, syncProfileToRuntime } from '../services/profileRuntime'
import { useToastStore } from '../stores/toastStore'
import { useI18n } from '../hooks/useI18n'

export function ProfileSwitcher() {
  const llmSettings = useSettingsStore((state) => state.llmSettings)
  const setActiveLLMProfile = useSettingsStore((state) => state.setActiveLLMProfile)
  const { showToast } = useToastStore()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [switchingProfileId, setSwitchingProfileId] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  const activeProfile = useMemo(
    () => getLLMProfileById(llmSettings, llmSettings.activeProfileId) || llmSettings.profiles[0],
    [llmSettings]
  )

  const filteredProfiles = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) return llmSettings.profiles

    return llmSettings.profiles.filter((profile) => {
      const payload = [
        profile.name,
        profile.config.model,
        profile.config.apiStyle,
        profile.config.baseURL
      ]
      return payload.some((value) => value.toLowerCase().includes(normalizedKeyword))
    })
  }, [keyword, llmSettings.profiles])

  useEffect(() => {
    if (!open) return
    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (!rootRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [open])

  const handleSelectProfile = async (profileId: string) => {
    if (profileId === llmSettings.activeProfileId) {
      setOpen(false)
      return
    }

    const profile = getLLMProfileById(llmSettings, profileId)
    if (!profile) return

    setSwitchingProfileId(profileId)
    try {
      await syncProfileToRuntime(llmSettings, profile)
      setActiveLLMProfile(profileId)
      showToast(t('toolbar.profile.switchSuccess', { name: profile.name }), 'success')
      setOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.toast.modelsLoadUnknown')
      showToast(t('toolbar.profile.switchFailed', { message }), 'error')
    } finally {
      setSwitchingProfileId('')
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 px-3 py-1.5 border border-border rounded text-sm hover:bg-accent"
        title={t('toolbar.profile.title')}
      >
        <span>{t('toolbar.profile.button', { name: activeProfile?.name || '-' })}</span>
        <ChevronsUpDown className="w-4 h-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[80vw] rounded-lg border border-border bg-background shadow-lg z-40">
          <div className="p-2 border-b border-border">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('toolbar.profile.searchPlaceholder')}
              className="w-full px-2.5 py-2 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="max-h-[380px] overflow-auto">
            {filteredProfiles.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground">{t('toolbar.profile.empty')}</div>
            ) : (
              filteredProfiles.map((profile) => {
                const isActive = profile.id === llmSettings.activeProfileId
                const isSwitching = switchingProfileId === profile.id

                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => void handleSelectProfile(profile.id)}
                    disabled={Boolean(switchingProfileId)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border/60 last:border-b-0 transition-colors ${
                      isActive ? 'bg-accent' : 'hover:bg-accent/60'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {profile.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {isSwitching
                          ? t('toolbar.profile.switching')
                          : isActive
                            ? t('common.current')
                            : profile.config.apiStyle}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">{profile.config.model || '-'}</div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

