import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import type { AppSettings } from '@shared/types/app-settings'

interface AppSettingsContextValue {
  settings: AppSettings
  setDemoMode(enabled: boolean): Promise<void>
}

const AppSettingsContext = createContext<AppSettingsContextValue>({
  settings: { demoMode: false },
  setDemoMode: async () => {}
})

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>({ demoMode: false })

  useEffect(() => {
    api.appSettings.get().then(setSettings)
  }, [])

  async function setDemoMode(enabled: boolean) {
    const next = await api.appSettings.set({ demoMode: enabled })
    setSettings(next)
  }

  return (
    <AppSettingsContext.Provider value={{ settings, setDemoMode }}>
      {children}
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings() {
  return useContext(AppSettingsContext)
}
