import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { TournamentPlayerRepository } from '../../db/repositories/tournament-player.repo'
import { ensureSinglesTeamOnAccept } from '../../services/auto-team.service'
import { getAppSettings } from '../../services/app-settings.service'
import type { RegistrationStatus } from '@shared/types/tournament-player'

export function registerTournamentPlayersHandler(): void {
  ipcMain.handle('tournamentPlayers:register', (_e, tournamentId: string, playerId: string) =>
    new TournamentPlayerRepository(getDb()).register(tournamentId, playerId)
  )
  ipcMain.handle('tournamentPlayers:registerMany', (_e, tournamentId: string, playerIds: string[]) =>
    new TournamentPlayerRepository(getDb()).registerMany(tournamentId, playerIds)
  )
  ipcMain.handle('tournamentPlayers:listByTournament', (_e, tournamentId: string) =>
    new TournamentPlayerRepository(getDb()).listByTournament(tournamentId)
  )
  ipcMain.handle('tournamentPlayers:updateStatus', (_e, id: string, status: RegistrationStatus) => {
    const db = getDb()
    const result = new TournamentPlayerRepository(db).updateStatus(id, status)
    if (status === 'accepted') {
      ensureSinglesTeamOnAccept(db, result.player_id, getAppSettings().demoMode)
    }
    return result
  })
  ipcMain.handle('tournamentPlayers:remove', (_e, id: string) =>
    new TournamentPlayerRepository(getDb()).remove(id)
  )
}
