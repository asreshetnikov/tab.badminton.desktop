import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { MatchRepository } from '../../db/repositories/match.repo'
import { RoundTeamRepository } from '../../db/repositories/round-team.repo'
import { generateMatches, updateStandings } from '../../services/round-robin.service'
import type { UpdateMatchResultDTO } from '@shared/types/match'

export function registerMatchesHandler(): void {
  ipcMain.handle('matches:generate', (_e, roundId: string) =>
    generateMatches(getDb(), roundId)
  )
  ipcMain.handle('matches:listByRound', (_e, roundId: string) =>
    new MatchRepository(getDb()).listByRound(roundId)
  )
  ipcMain.handle('matches:deleteByRound', (_e, roundId: string) =>
    new MatchRepository(getDb()).deleteByRound(roundId)
  )
  ipcMain.handle('matches:updateResult', (_e, matchId: string, dto: UpdateMatchResultDTO) => {
    const db = getDb()
    const match = new MatchRepository(db).updateResult(matchId, dto)
    updateStandings(db, match.round_id)
    const standings = new RoundTeamRepository(db).listTableWithTeamsByRound(match.round_id)
    return { match, standings }
  })
}
