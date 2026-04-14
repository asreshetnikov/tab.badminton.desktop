import { eq, asc } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { MatchWithTeams, UpdateMatchResultDTO } from '@shared/types/match'

export class MatchRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  getById(matchId: string): MatchWithTeams | undefined {
    const match = this.db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .get()
    return match ? this.toMatchWithTeams(match) : undefined
  }

  listByRound(roundId: string): MatchWithTeams[] {
    const rows = this.db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.round_id, roundId))
      .orderBy(asc(schema.matches.tour))
      .all()

    return rows.map((match) => this.toMatchWithTeams(match))
  }

  deleteByRound(roundId: string): void {
    this.db.delete(schema.matches).where(eq(schema.matches.round_id, roundId)).run()
  }

  updateResult(matchId: string, dto: UpdateMatchResultDTO): MatchWithTeams {
    const match = this.db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .get()
    if (!match) throw new Error(`Match not found: ${matchId}`)

    let s1: number | null = null
    let s2: number | null = null
    let winner_team_id: string | null = null

    if (dto.status === 'finished' || dto.status === 'retired') {
      s1 = dto.sets.filter((s) => s.s1 > s.s2).length
      s2 = dto.sets.filter((s) => s.s2 > s.s1).length
      if (s1 > s2) winner_team_id = match.team1_id
      else if (s2 > s1) winner_team_id = match.team2_id
    } else if (dto.status === 'walkover') {
      winner_team_id = dto.winner_team_id ?? null
      s1 = winner_team_id === match.team1_id ? 1 : 0
      s2 = winner_team_id === match.team2_id ? 1 : 0
    }

    this.db
      .update(schema.matches)
      .set({ status: dto.status, s1, s2, winner_team_id })
      .where(eq(schema.matches.id, matchId))
      .run()

    this.db.delete(schema.match_sets).where(eq(schema.match_sets.match_id, matchId)).run()
    dto.sets.forEach((set, i) => {
      this.db
        .insert(schema.match_sets)
        .values({ id: randomUUID(), match_id: matchId, order: i + 1, s1: set.s1, s2: set.s2 })
        .run()
    })

    return this.toMatchWithTeams(
      this.db.select().from(schema.matches).where(eq(schema.matches.id, matchId)).get()!
    )
  }

  private toMatchWithTeams(match: typeof schema.matches.$inferSelect): MatchWithTeams {
    const team1 = match.team1_id
      ? this.db.select().from(schema.teams).where(eq(schema.teams.id, match.team1_id)).get() ?? null
      : null
    const team2 = match.team2_id
      ? this.db.select().from(schema.teams).where(eq(schema.teams.id, match.team2_id)).get() ?? null
      : null
    const sets = this.db
      .select()
      .from(schema.match_sets)
      .where(eq(schema.match_sets.match_id, match.id))
      .orderBy(asc(schema.match_sets.order))
      .all()

    return {
      ...match,
      team1: team1 ? { id: team1.id, name: team1.name } : null,
      team2: team2 ? { id: team2.id, name: team2.name } : null,
      sets
    }
  }
}
