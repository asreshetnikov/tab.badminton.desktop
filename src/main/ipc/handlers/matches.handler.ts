import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { MatchRepository } from '../../db/repositories/match.repo'
import { generateMatches } from '../../services/round-robin.service'

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
}
