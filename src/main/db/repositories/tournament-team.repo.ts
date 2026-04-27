import { and, eq, inArray } from 'drizzle-orm'
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

  setSeed(tournamentTeamId: string, lo: number | null, hi: number | null): TournamentTeamWithTeam {
    const row = this.db
      .select()
      .from(schema.tournament_teams)
      .where(eq(schema.tournament_teams.id, tournamentTeamId))
      .get()
    if (!row) throw new Error(`TournamentTeam not found: ${tournamentTeamId}`)

    this.assertNoEventMatches(row.event_id)
    this.validateDeclaredSeed(row.event_id, tournamentTeamId, lo, hi)

    this.db
      .update(schema.tournament_teams)
      .set({ seed_lo: lo, seed_hi: hi })
      .where(eq(schema.tournament_teams.id, tournamentTeamId))
      .run()

    this.db
      .update(schema.round_teams)
      .set({ seed: null })
      .where(
        and(
          eq(schema.round_teams.team_id, row.team_id),
          inArray(
            schema.round_teams.round_id,
            this.db
              .select({ id: schema.rounds.id })
              .from(schema.rounds)
              .where(eq(schema.rounds.event_id, row.event_id))
          )
        )
      )
      .run()

    return this.getByIdOrThrow(tournamentTeamId)
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

  private assertNoEventMatches(eventId: string): void {
    const existing = this.db
      .select({ id: schema.matches.id })
      .from(schema.matches)
      .innerJoin(schema.rounds, eq(schema.matches.round_id, schema.rounds.id))
      .where(eq(schema.rounds.event_id, eventId))
      .get()
    if (existing) throw new Error('EVENT_HAS_MATCHES')
  }

  private validateDeclaredSeed(
    eventId: string,
    tournamentTeamId: string,
    lo: number | null,
    hi: number | null
  ): void {
    if (lo === null && hi === null) return
    if (lo === null || lo <= 0 || (hi !== null && hi <= 0) || (hi !== null && lo >= hi)) {
      throw new Error('INVALID_SEED_RANGE')
    }
    if (hi !== null && !isPowerOfTwo(hi)) throw new Error('SEED_HI_NOT_POWER_OF_TWO')
    if (hi !== null && !(lo === 1 && hi === 2) && lo !== hi / 2 + 1) {
      throw new Error('SEED_LO_INVALID_FOR_HI')
    }

    const rows = this.db
      .select()
      .from(schema.tournament_teams)
      .where(eq(schema.tournament_teams.event_id, eventId))
      .all()
      .filter((row) => row.id !== tournamentTeamId)

    if (hi === null && rows.some((row) => row.seed_lo === lo && row.seed_hi === null)) {
      throw new Error('SEED_ALREADY_TAKEN')
    }
  }
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0
}
