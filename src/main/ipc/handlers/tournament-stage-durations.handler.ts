import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { TournamentStageDurationsRepository } from '../../db/repositories/tournament-stage-durations.repo'
import type { UpsertStageDurationDTO } from '@shared/types/tournament-stage-duration'

export function registerTournamentStageDurationsHandler(): void {
  ipcMain.handle('stageDurations:list', (_e, tournamentId: string) =>
    new TournamentStageDurationsRepository(getDb()).listByTournament(tournamentId)
  )

  ipcMain.handle(
    'stageDurations:upsert',
    (_e, tournamentId: string, bracketRound: number, dto: UpsertStageDurationDTO) =>
      new TournamentStageDurationsRepository(getDb()).upsert(tournamentId, bracketRound, dto)
  )

  ipcMain.handle('stageDurations:delete', (_e, id: string) =>
    new TournamentStageDurationsRepository(getDb()).delete(id)
  )
}
