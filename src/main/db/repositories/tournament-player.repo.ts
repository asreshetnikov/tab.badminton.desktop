import { and, eq, inArray } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { TournamentPlayerWithPlayer, RegistrationStatus } from '@shared/types/tournament-player'
import type { PlayerActivityStatus } from '@shared/types/player-activity'
import type { EventCategory } from '@shared/types/event'

export class TournamentPlayerRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  register(tournamentId: string, playerId: string): TournamentPlayerWithPlayer {
    const id = randomUUID()
    const registered_at = new Date().toISOString()
    this.db
      .insert(schema.tournament_players)
      .values({ id, tournament_id: tournamentId, player_id: playerId, registered_at })
      .run()
    return this.getByIdOrThrow(id)
  }

  registerMany(tournamentId: string, playerIds: string[]): TournamentPlayerWithPlayer[] {
    return playerIds.map((playerId) => this.register(tournamentId, playerId))
  }

  listByTournament(tournamentId: string): TournamentPlayerWithPlayer[] {
    const rows = this.db
      .select()
      .from(schema.tournament_players)
      .where(eq(schema.tournament_players.tournament_id, tournamentId))
      .all()

    return rows.map((row) => {
      const player = this.db
        .select()
        .from(schema.players)
        .where(eq(schema.players.id, row.player_id))
        .get()
      if (!player) throw new Error(`Player not found: ${row.player_id}`)
      return { ...row, player }
    })
  }

  updateStatus(id: string, status: RegistrationStatus): TournamentPlayerWithPlayer {
    this.db
      .update(schema.tournament_players)
      .set({ status })
      .where(eq(schema.tournament_players.id, id))
      .run()
    return this.getByIdOrThrow(id)
  }

  remove(id: string): void {
    this.db.delete(schema.tournament_players).where(eq(schema.tournament_players.id, id)).run()
  }

  getPlayerActivity(tournamentId: string): PlayerActivityStatus[] {
    const tpRows = this.db
      .select({
        player_id: schema.players.id,
        first_name: schema.players.first_name,
        last_name: schema.players.last_name,
        club: schema.players.club,
        gender: schema.players.gender,
      })
      .from(schema.tournament_players)
      .innerJoin(schema.players, eq(schema.players.id, schema.tournament_players.player_id))
      .where(
        and(
          eq(schema.tournament_players.tournament_id, tournamentId),
          eq(schema.tournament_players.status, 'accepted')
        )
      )
      .all()

    if (tpRows.length === 0) return []

    const ttRows = this.db
      .select({
        team_id: schema.tournament_teams.team_id,
        event_id: schema.tournament_teams.event_id,
        category: schema.events.category,
      })
      .from(schema.tournament_teams)
      .innerJoin(schema.events, eq(schema.events.id, schema.tournament_teams.event_id))
      .where(eq(schema.tournament_teams.tournament_id, tournamentId))
      .all()

    const teamToEvent = new Map<string, { eventId: string; category: string }>()
    for (const row of ttRows) {
      teamToEvent.set(row.team_id, { eventId: row.event_id, category: row.category })
    }

    const allTeamIds = [...teamToEvent.keys()]

    const tplRows =
      allTeamIds.length > 0
        ? this.db
            .select({ team_id: schema.team_players.team_id, player_id: schema.team_players.player_id })
            .from(schema.team_players)
            .where(inArray(schema.team_players.team_id, allTeamIds))
            .all()
        : []

    const playerToTeams = new Map<string, string[]>()
    for (const row of tplRows) {
      if (!playerToTeams.has(row.player_id)) playerToTeams.set(row.player_id, [])
      playerToTeams.get(row.player_id)!.push(row.team_id)
    }

    const eventIds = [...new Set(ttRows.map((r) => r.event_id))]
    const roundRows =
      eventIds.length > 0
        ? this.db
            .select({ id: schema.rounds.id, event_id: schema.rounds.event_id })
            .from(schema.rounds)
            .where(inArray(schema.rounds.event_id, eventIds))
            .all()
        : []

    const roundToEvent = new Map<string, string>()
    for (const r of roundRows) roundToEvent.set(r.id, r.event_id)

    const allRoundIds = roundRows.map((r) => r.id)

    const matchRows =
      allRoundIds.length > 0
        ? this.db
            .select({
              round_id: schema.matches.round_id,
              team1_id: schema.matches.team1_id,
              team2_id: schema.matches.team2_id,
              status: schema.matches.status,
            })
            .from(schema.matches)
            .where(inArray(schema.matches.round_id, allRoundIds))
            .all()
        : []

    const FINISHED = new Set(['finished', 'walkover', 'retired'])
    const teamEventUnfinished = new Map<string, boolean>()

    for (const m of matchRows) {
      const eventId = roundToEvent.get(m.round_id)
      if (!eventId) continue
      const isUnfinished = !FINISHED.has(m.status ?? '')

      for (const teamId of [m.team1_id, m.team2_id]) {
        if (!teamId) continue
        const key = `${teamId}:${eventId}`
        if (isUnfinished) {
          teamEventUnfinished.set(key, true)
        } else if (!teamEventUnfinished.has(key)) {
          teamEventUnfinished.set(key, false)
        }
      }
    }

    return tpRows
      .sort(
        (a, b) =>
          a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
      )
      .map((row) => {
        const teams = playerToTeams.get(row.player_id) ?? []
        const categoryActive = new Map<string, boolean>()

        for (const teamId of teams) {
          const eventInfo = teamToEvent.get(teamId)
          if (!eventInfo) continue
          const key = `${teamId}:${eventInfo.eventId}`
          const hasUnfinished = teamEventUnfinished.get(key) ?? false

          if (hasUnfinished) {
            categoryActive.set(eventInfo.category, true)
          } else if (!categoryActive.has(eventInfo.category)) {
            categoryActive.set(eventInfo.category, false)
          }
        }

        const activeCategories: EventCategory[] = []
        const doneCategories: EventCategory[] = []
        for (const [cat, isActive] of categoryActive) {
          if (isActive) activeCategories.push(cat as EventCategory)
          else doneCategories.push(cat as EventCategory)
        }

        return {
          playerId: row.player_id,
          firstName: row.first_name,
          lastName: row.last_name,
          club: row.club,
          gender: row.gender,
          activeCategories,
          doneCategories,
        }
      })
  }

  private getByIdOrThrow(id: string): TournamentPlayerWithPlayer {
    const row = this.db
      .select()
      .from(schema.tournament_players)
      .where(eq(schema.tournament_players.id, id))
      .get()
    if (!row) throw new Error(`TournamentPlayer not found: ${id}`)
    const player = this.db
      .select()
      .from(schema.players)
      .where(eq(schema.players.id, row.player_id))
      .get()
    if (!player) throw new Error(`Player not found: ${row.player_id}`)
    return { ...row, player }
  }
}
