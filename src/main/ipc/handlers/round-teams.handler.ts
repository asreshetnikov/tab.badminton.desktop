import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { RoundTeamRepository } from '../../db/repositories/round-team.repo'

export function registerRoundTeamsHandler(): void {
  ipcMain.handle('roundTeams:add', (_e, roundId: string, teamId: string) =>
    new RoundTeamRepository(getDb()).add(roundId, teamId)
  )
  ipcMain.handle('roundTeams:addMany', (_e, roundId: string, teamIds: string[]) =>
    new RoundTeamRepository(getDb()).addMany(roundId, teamIds)
  )
  ipcMain.handle('roundTeams:listByRound', (_e, roundId: string) =>
    new RoundTeamRepository(getDb()).listByRound(roundId)
  )
  ipcMain.handle('roundTeams:remove', (_e, id: string) =>
    new RoundTeamRepository(getDb()).remove(id)
  )
}
