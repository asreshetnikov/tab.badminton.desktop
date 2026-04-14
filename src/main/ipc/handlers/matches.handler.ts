import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import * as schema from '../../db/schema'
import { MatchRepository } from '../../db/repositories/match.repo'
import { RoundTeamRepository } from '../../db/repositories/round-team.repo'
import { generateMatches, updateStandings } from '../../services/round-robin.service'
import { generateBracket, advanceWinner } from '../../services/playoff.service'
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
  ipcMain.handle('matches:generatePlayoff', (_e, roundId: string) =>
    generateBracket(getDb(), roundId)
  )
  ipcMain.handle('matches:updateResult', (_e, matchId: string, dto: UpdateMatchResultDTO) => {
    const db = getDb()
    const match = new MatchRepository(db).updateResult(matchId, dto)

    const round = db
      .select({ type: schema.rounds.type })
      .from(schema.rounds)
      .where(eq(schema.rounds.id, match.round_id))
      .get()

    let standings: ReturnType<RoundTeamRepository['listTableWithTeamsByRound']> = []
    if (round?.type === 'playoff') {
      advanceWinner(db, matchId)
    } else {
      updateStandings(db, match.round_id)
      standings = new RoundTeamRepository(db).listTableWithTeamsByRound(match.round_id)
    }

    return { match, standings }
  })
}
