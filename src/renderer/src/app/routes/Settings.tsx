import { useAppSettings } from '@renderer/contexts/AppSettingsContext'
import { useTranslation } from 'react-i18next'

export function Settings() {
  const { settings, setDemoMode } = useAppSettings()
  const { t } = useTranslation()

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-6">{t('nav.settings')}</h1>

      <div className="space-y-4">
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
      </div>
    </div>
  )
}
