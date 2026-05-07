import { ipcMain } from 'electron'
import { getAppSettings, setAppSettings } from '../../services/app-settings.service'
import { getDb } from '../../db/client'
import { simulateTournament } from '../../services/simulate.service'
import type { AppSettings } from '../../../shared/types/app-settings'

export function registerAppSettingsHandler(): void {
  ipcMain.handle('appSettings:get', () => getAppSettings())

  ipcMain.handle('appSettings:set', (_e, settings: Partial<AppSettings>) =>
    setAppSettings(settings)
  )

  ipcMain.handle('tournaments:simulate', (_e, tournamentId: string) =>
    simulateTournament(getDb(), tournamentId)
  )
}
