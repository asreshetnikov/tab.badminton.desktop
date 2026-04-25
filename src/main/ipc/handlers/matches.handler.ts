import { ipcMain } from 'electron'
import { and, eq, ne } from 'drizzle-orm'
import { toLocalISO } from '../../utils/datetime'
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
  ipcMain.handle('matches:regenerateForTournament', (_e, tournamentId: string) => {
    const db = getDb()
    const events = db
      .select({ id: schema.events.id })
      .from(schema.events)
      .where(eq(schema.events.tournament_id, tournamentId))
      .all()
    for (const event of events) {
      const rounds = db
        .select({ id: schema.rounds.id, type: schema.rounds.type })
        .from(schema.rounds)
        .where(eq(schema.rounds.event_id, event.id))
        .all()
      for (const round of rounds) {
        new MatchRepository(db).deleteByRound(round.id)
        const teamCount = db
          .select({ team_id: schema.round_teams.team_id })
          .from(schema.round_teams)
          .where(eq(schema.round_teams.round_id, round.id))
          .all().length
        if (teamCount < 2) continue
        if (round.type === 'round_robin') {
          generateMatches(db, round.id)
          updateStandings(db, round.id)
        } else {
          generateBracket(db, round.id)
        }
      }
    }
  })
  ipcMain.handle('matches:generatePlayoff', (_e, roundId: string) =>
    generateBracket(getDb(), roundId)
  )
  ipcMain.handle('matches:startMatch', (_e, matchId: string, actualStart?: string) => {
    const db = getDb()

    const match = db
      .select({ court_id: schema.matches.court_id })
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .get()

    if (match?.court_id) {
      const courtConflict = db
        .select({ id: schema.matches.id })
        .from(schema.matches)
        .where(
          and(
            eq(schema.matches.court_id, match.court_id),
            eq(schema.matches.status, 'live'),
            ne(schema.matches.id, matchId)
          )
        )
        .get()

      if (courtConflict) {
        throw new Error('COURT_BUSY')
      }
    }

    const startTime = actualStart ?? toLocalISO(new Date())
    db.update(schema.matches)
      .set({ status: 'live', actual_start: startTime })
      .where(eq(schema.matches.id, matchId))
      .run()
    return new MatchRepository(db).getById(matchId)
  })

  ipcMain.handle('matches:updateResult', (_e, matchId: string, dto: UpdateMatchResultDTO) => {
    const db = getDb()
    const match = new MatchRepository(db).updateResult(matchId, dto)

    const round = db
      .select({ type: schema.rounds.type, event_id: schema.rounds.event_id })
      .from(schema.rounds)
      .where(eq(schema.rounds.id, match.round_id))
      .get()

    // Find tournament_id via event (needed for both playoff and RR)
    const event = db
      .select({ tournament_id: schema.events.tournament_id })
      .from(schema.events)
      .where(eq(schema.events.id, round!.event_id))
      .get()

    let standings: ReturnType<RoundTeamRepository['listTableWithTeamsByRound']> = []
    if (round?.type === 'playoff') {
      advanceWinner(db, matchId)
    } else {
      updateStandings(db, match.round_id)
      standings = new RoundTeamRepository(db).listTableWithTeamsByRound(match.round_id)
    }

    if (event) {
      onMatchCompleted(db, matchId, event.tournament_id)
    }

    return { match, standings }
  })
}
