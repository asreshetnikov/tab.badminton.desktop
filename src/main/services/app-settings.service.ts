import { app } from 'electron'
import { resolve } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { AppSettings } from '../../shared/types/app-settings'

const DEFAULT: AppSettings = {
  demoMode: false,
  defaultMatchDuration: 30,
  publishToken: '',
}

function settingsPath(): string {
  return resolve(app.getPath('userData'), 'app-settings.json')
}

export function getAppSettings(): AppSettings {
  const path = settingsPath()
  if (!existsSync(path)) return { ...DEFAULT }
  try {
    return { ...DEFAULT, ...JSON.parse(readFileSync(path, 'utf-8')) }
  } catch {
    return { ...DEFAULT }
  }
}

export function setAppSettings(settings: Partial<AppSettings>): AppSettings {
  const next = { ...getAppSettings(), ...settings }
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}