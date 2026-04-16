import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import * as schema from '../../db/schema'
import { MatchRepository } from '../../db/repositories/match.repo'
import { RoundTeamRepository } from '../../db/repositories/round-team.repo'
import { generateMatches, updateStandings } from '../../services/round-robin.service'
import { generateBracket, advanceWinner } from '../../services/playoff.service'
import { onMatchCompleted } from '../../services/scheduler.service'
import type { UpdateMatchResultDTO } from '@shared/types/match'

export function registerMatchesHandler(): void {
  ipcMain.handle('matches:getById', (_e, matchId: string) =>
    new MatchRepository(getDb()).getById(matchId)
  )
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
      .select({ type: schema.rounds.type, event_id: schema.rounds.event_id })
      .from(schema.rounds)
      .where(eq(schema.rounds.id, match.round_id))
      .get()

    let standings: ReturnType<RoundTeamRepository['listTableWithTeamsByRound']> = []
    if (round?.type === 'playoff') {
      advanceWinner(db, matchId)

      // Find tournament_id via event
      const event = db
        .select({ tournament_id: schema.events.tournament_id })
        .from(schema.events)
        .where(eq(schema.events.id, round.event_id))
        .get()

      if (event) {
        onMatchCompleted(db, matchId, event.tournament_id)
      }
    } else {
      updateStandings(db, match.round_id)
      standings = new RoundTeamRepository(db).listTableWithTeamsByRound(match.round_id)
    }

    return { match, standings }
  })
}
