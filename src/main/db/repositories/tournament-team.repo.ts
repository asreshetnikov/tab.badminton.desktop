import { eq, inArray } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { TournamentTeamWithTeam } from '@shared/types/tournament-team'

export class TournamentTeamRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  add(tournamentId: string, eventId: string, teamId: string): TournamentTeamWithTeam {
    const id = randomUUID()
    this.db
      .insert(schema.tournament_teams)
      .values({ id, tournament_id: tournamentId, event_id: eventId, team_id: teamId })
      .run()
    return this.getByIdOrThrow(id)
  }

  addMany(tournamentId: string, eventId: string, teamIds: string[]): TournamentTeamWithTeam[] {
    return teamIds.map((teamId) => this.add(tournamentId, eventId, teamId))
  }

  listByTournament(tournamentId: string): TournamentTeamWithTeam[] {
    const rows = this.db
      .select()
      .from(schema.tournament_teams)
      .where(eq(schema.tournament_teams.tournament_id, tournamentId))
      .all()
    return rows.map((row) => ({ ...row, team: this.loadTeam(row.team_id) }))
  }

  remove(id: string): void {
    this.db.delete(schema.tournament_teams).where(eq(schema.tournament_teams.id, id)).run()
  }

  private loadTeam(teamId: string) {
    const team = this.db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).get()
    if (!team) throw new Error(`Team not found: ${teamId}`)

    const tpRows = this.db
      .select()
      .from(schema.team_players)
      .where(eq(schema.team_players.team_id, teamId))
      .orderBy(schema.team_players.position)
      .all()

    const players =
      tpRows.length === 0
        ? []
        : this.db
            .select()
            .from(schema.players)
            .where(inArray(schema.players.id, tpRows.map((r) => r.player_id)))
            .all()
            .sort(
              (a, b) =>
                tpRows.findIndex((r) => r.player_id === a.id) -
                tpRows.findIndex((r) => r.player_id === b.id)
            )

    return { ...team, players }
  }

  private getByIdOrThrow(id: string): TournamentTeamWithTeam {
    const row = this.db
      .select()
      .from(schema.tournament_teams)
      .where(eq(schema.tournament_teams.id, id))
      .get()
    if (!row) throw new Error(`TournamentTeam not found: ${id}`)
    return { ...row, team: this.loadTeam(row.team_id) }
  }
}
