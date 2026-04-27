import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { TournamentTeamRepository } from '../../db/repositories/tournament-team.repo'

export function registerTournamentTeamsHandler(): void {
  ipcMain.handle('tournamentTeams:add', (_e, tournamentId: string, eventId: string, teamId: string) =>
    new TournamentTeamRepository(getDb()).add(tournamentId, eventId, teamId)
  )
  ipcMain.handle('tournamentTeams:addMany', (_e, tournamentId: string, eventId: string, teamIds: string[]) =>
    new TournamentTeamRepository(getDb()).addMany(tournamentId, eventId, teamIds)
  )
  ipcMain.handle('tournamentTeams:listByTournament', (_e, tournamentId: string) =>
    new TournamentTeamRepository(getDb()).listByTournament(tournamentId)
  )
  ipcMain.handle('tournamentTeams:setSeed', (_e, tournamentTeamId: string, lo: number | null, hi: number | null) =>
    new TournamentTeamRepository(getDb()).setSeed(tournamentTeamId, lo, hi)
  )
  ipcMain.handle('tournamentTeams:remove', (_e, id: string) =>
    new TournamentTeamRepository(getDb()).remove(id)
  )
}
