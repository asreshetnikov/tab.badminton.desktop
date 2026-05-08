import { useAppSettings } from '@renderer/contexts/AppSettingsContext'
import { useTranslation } from 'react-i18next'

export function Settings() {
  const { settings, setDemoMode, setDefaultMatchDuration } = useAppSettings()
  const { t } = useTranslation()

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-6">{t('nav.settings')}</h1>

      <div className="space-y-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.demoMode}
            onChange={(e) => setDemoMode(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-primary"
          />
          <div>
            <div className="text-sm font-medium">Demo mode</div>
            <div className="text-xs text-muted-foreground">
              Shows a Demo badge and enables tournament simulation
            </div>
          </div>
        </label>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium">Default match duration</div>
            <div className="text-xs text-muted-foreground">
              Used as the fallback duration in Day Settings
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              value={settings.defaultMatchDuration}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                if (v > 0) setDefaultMatchDuration(v)
              }}
              className="h-7 w-20 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
        </div>
      </div>
    </div>
  )
}
