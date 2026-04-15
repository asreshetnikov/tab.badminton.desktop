import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { TournamentDaySettingsRepository } from '../../db/repositories/tournament-day-settings.repo'
import type { UpsertTournamentDaySettingDTO } from '@shared/types/tournament-day-settings'

export function registerTournamentDaySettingsHandler(): void {
  ipcMain.handle('tournamentDaySettings:listByTournament', (_e, tournamentId: string) =>
    new TournamentDaySettingsRepository(getDb()).listByTournament(tournamentId)
  )
  ipcMain.handle(
    'tournamentDaySettings:upsert',
    (_e, tournamentId: string, date: string, dto: UpsertTournamentDaySettingDTO) =>
      new TournamentDaySettingsRepository(getDb()).upsert(tournamentId, date, dto)
  )
  ipcMain.handle('tournamentDaySettings:delete', (_e, id: string) =>
    new TournamentDaySettingsRepository(getDb()).delete(id)
  )
}
