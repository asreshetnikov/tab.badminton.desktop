import { eq, and } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { RoundTeamWithTeam, RoundTableRow } from '@shared/types/round-team'

export class RoundTeamRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  add(roundId: string, teamId: string): RoundTeamWithTeam {
    const id = randomUUID()
    this.db.insert(schema.round_teams).values({ id, round_id: roundId, team_id: teamId }).run()

    const tableId = randomUUID()
    this.db
      .insert(schema.round_table)
      .values({ id: tableId, round_id: roundId, team_id: teamId })
      .run()

    return this.getByIdOrThrow(id)
  }

  addMany(roundId: string, teamIds: string[]): RoundTeamWithTeam[] {
    return teamIds.map((teamId) => this.add(roundId, teamId))
  }

  listByRound(roundId: string): RoundTeamWithTeam[] {
    const rows = this.db
      .select({
        id: schema.round_teams.id,
        round_id: schema.round_teams.round_id,
        team_id: schema.round_teams.team_id,
        status: schema.round_teams.status,
        seed: schema.round_teams.seed,
        checked_in: schema.round_teams.checked_in,
        team_name: schema.teams.name,
        team_category: schema.teams.category
      })
      .from(schema.round_teams)
      .innerJoin(schema.teams, eq(schema.round_teams.team_id, schema.teams.id))
      .where(eq(schema.round_teams.round_id, roundId))
      .all()

    return rows.map((r) => ({
      id: r.id,
      round_id: r.round_id,
      team_id: r.team_id,
      status: r.status,
      seed: r.seed,
      checked_in: r.checked_in,
      team: { id: r.team_id, name: r.team_name, category: r.team_category }
    }))
  }

  listTableByRound(roundId: string): RoundTableRow[] {
    return this.db
      .select()
      .from(schema.round_table)
      .where(eq(schema.round_table.round_id, roundId))
      .all()
  }

  remove(id: string): void {
    const row = this.db
      .select()
      .from(schema.round_teams)
      .where(eq(schema.round_teams.id, id))
      .get()
    if (!row) return

    this.db
      .delete(schema.round_table)
      .where(
        and(
          eq(schema.round_table.round_id, row.round_id),
          eq(schema.round_table.team_id, row.team_id)
        )
      )
      .run()
    this.db.delete(schema.round_teams).where(eq(schema.round_teams.id, id)).run()
  }

  private getByIdOrThrow(id: string): RoundTeamWithTeam {
    const rows = this.db
      .select({
        id: schema.round_teams.id,
        round_id: schema.round_teams.round_id,
        team_id: schema.round_teams.team_id,
        status: schema.round_teams.status,
        seed: schema.round_teams.seed,
        checked_in: schema.round_teams.checked_in,
        team_name: schema.teams.name,
        team_category: schema.teams.category
      })
      .from(schema.round_teams)
      .innerJoin(schema.teams, eq(schema.round_teams.team_id, schema.teams.id))
      .where(eq(schema.round_teams.id, id))
      .all()

    const row = rows[0]
    if (!row) throw new Error(`RoundTeam not found: ${id}`)
    return {
      id: row.id,
      round_id: row.round_id,
      team_id: row.team_id,
      status: row.status,
      seed: row.seed,
      checked_in: row.checked_in,
      team: { id: row.team_id, name: row.team_name, category: row.team_category }
    }
  }
}
