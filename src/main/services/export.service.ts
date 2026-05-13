import { eq, and, inArray } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import type {
  TournamentSnapshot,
  SnapshotEvent,
  SnapshotRound,
  SnapshotMatch,
  SnapshotStandingRow
} from '@shared/types/tournament-snapshot'

export function buildSnapshot(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string
): TournamentSnapshot {
  const tournament = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, tournamentId))
    .get()
  if (!tournament) throw new Error(`Tournament not found: ${tournamentId}`)

  const venue = tournament.venue_id
    ? (db.select().from(schema.venues).where(eq(schema.venues.id, tournament.venue_id)).get() ?? null)
    : null

  const courts = db
    .select()
    .from(schema.courts)
    .where(eq(schema.courts.tournament_id, tournamentId))
    .all()

  const events = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .orderBy(schema.events.order)
    .all()

  const players = db
    .select({
      id: schema.players.id,
      first_name: schema.players.first_name,
      last_name: schema.players.last_name,
      club: schema.players.club
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

  const snapshotEvents: SnapshotEvent[] = events.map((event) => {
    const rounds = db
      .select()
      .from(schema.rounds)
      .where(eq(schema.rounds.event_id, event.id))
      .orderBy(schema.rounds.order)
      .all()

    const snapshotRounds: SnapshotRound[] = rounds.map((round) => buildRound(db, round))

    return {
      id: event.id,
      name: event.name,
      category: event.category,
      order: event.order,
      rounds: snapshotRounds
    }
  })

  return {
    exportedAt: new Date().toISOString(),
    tournament: {
      id: tournament.id,
      name: tournament.name,
      date_start: tournament.date_start,
      date_end: tournament.date_end,
      status: tournament.status,
      venue: venue ? { name: venue.name, address: venue.address ?? null } : null
    },
    courts: courts.map((c) => ({ id: c.id, name: c.name })),
    events: snapshotEvents,
    players
  }
}

function buildRound(
  db: BetterSQLite3Database<typeof schema>,
  round: typeof schema.rounds.$inferSelect
): SnapshotRound {
  const roundTeamRows = db
    .select({ team_id: schema.round_teams.team_id, team_name: schema.teams.name })
    .from(schema.round_teams)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.round_teams.team_id))
    .where(eq(schema.round_teams.round_id, round.id))
    .all()

  const teamIds = roundTeamRows.map((r) => r.team_id)

  const teamPlayerRows =
    teamIds.length > 0
      ? db
          .select({ team_id: schema.team_players.team_id, player_id: schema.team_players.player_id })
          .from(schema.team_players)
          .where(inArray(schema.team_players.team_id, teamIds))
          .all()
      : []

  const playersByTeam = new Map<string, string[]>()
  for (const r of teamPlayerRows) {
    if (!playersByTeam.has(r.team_id)) playersByTeam.set(r.team_id, [])
    playersByTeam.get(r.team_id)!.push(r.player_id)
  }

  const teams = roundTeamRows.map((r) => ({
    id: r.team_id,
    name: r.team_name,
    player_ids: playersByTeam.get(r.team_id) ?? []
  }))

  const matchRows = db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.round_id, round.id))
    .orderBy(schema.matches.tour)
    .all()

  const matchIds = matchRows.map((m) => m.id)
  const allSets =
    matchIds.length > 0
      ? db
          .select()
          .from(schema.match_sets)
          .where(inArray(schema.match_sets.match_id, matchIds))
          .orderBy(schema.match_sets.order)
          .all()
      : []

  const setsByMatch = new Map<string, Array<{ s1: number; s2: number }>>()
  for (const s of allSets) {
    if (!setsByMatch.has(s.match_id)) setsByMatch.set(s.match_id, [])
    setsByMatch.get(s.match_id)!.push({ s1: s.s1, s2: s.s2 })
  }

  const matches: SnapshotMatch[] = matchRows.map((m) => ({
    id: m.id,
    team1_id: m.team1_id,
    team2_id: m.team2_id,
    winner_id: m.winner_team_id,
    sets: setsByMatch.get(m.id) ?? [],
    status: m.status,
    scheduled_at: m.scheduled_at,
    court_id: m.court_id,
    win_match_id: m.win_match_id,
    left_match_id: m.left_match_id,
    right_match_id: m.right_match_id,
    tour: m.tour
  }))

  let standings: SnapshotStandingRow[] | undefined = undefined
  if (round.type === 'round_robin') {
    standings = db
      .select()
      .from(schema.round_table)
      .where(eq(schema.round_table.round_id, round.id))
      .all()
      .map((r) => ({
        team_id: r.team_id,
        wins: r.wins,
        losses: r.losses,
        sets_won: r.sets_won,
        sets_lost: r.sets_lost,
        points_won: r.points_won,
        points_lost: r.points_lost,
        position: r.position
      }))
  }

  return {
    id: round.id,
    name: round.name,
    type: round.type,
    order: round.order,
    teams,
    matches,
    standings
  }
}
