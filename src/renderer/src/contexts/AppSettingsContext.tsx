import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import type { AppSettings } from '@shared/types/app-settings'

interface AppSettingsContextValue {
  settings: AppSettings
  setDemoMode(enabled: boolean): Promise<void>
  setDefaultMatchDuration(minutes: number): Promise<void>
  setPublishToken(token: string): Promise<void>
}

const DEFAULT_SETTINGS: AppSettings = {
  demoMode: false,
  defaultMatchDuration: 30,
  publishToken: '',
}

const AppSettingsContext = createContext<AppSettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  setDemoMode: async () => {},
  setDefaultMatchDuration: async () => {},
  setPublishToken: async () => {},
})

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    api.appSettings.get().then(setSettings)
  }, [])

  async function setDemoMode(enabled: boolean) {
    const next = await api.appSettings.set({ demoMode: enabled })
    setSettings(next)
  }

  async function setDefaultMatchDuration(minutes: number) {
    const next = await api.appSettings.set({ defaultMatchDuration: minutes })
    setSettings(next)
  }

  async function setPublishToken(token: string) {
    const next = await api.appSettings.set({ publishToken: token })
    setSettings(next)
  }

  return (
    <AppSettingsContext.Provider value={{ settings, setDemoMode, setDefaultMatchDuration, setPublishToken }}>
      {children}
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings() {
  return useContext(AppSettingsContext)
}
