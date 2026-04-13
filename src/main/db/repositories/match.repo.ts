import { eq, asc } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../schema'
import type { MatchWithTeams } from '@shared/types/match'

export class MatchRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

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

  private toMatchWithTeams(match: typeof schema.matches.$inferSelect): MatchWithTeams {
    const team1 = match.team1_id
      ? this.db.select().from(schema.teams).where(eq(schema.teams.id, match.team1_id)).get() ?? null
      : null
    const team2 = match.team2_id
      ? this.db.select().from(schema.teams).where(eq(schema.teams.id, match.team2_id)).get() ?? null
      : null

    return {
      ...match,
      team1: team1 ? { id: team1.id, name: team1.name } : null,
      team2: team2 ? { id: team2.id, name: team2.name } : null
    }
  }
}
