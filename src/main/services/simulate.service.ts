import { eq, inArray } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { MatchRepository } from '../db/repositories/match.repo'
import { advanceWinner } from './playoff.service'
import { updateStandings } from './round-robin.service'
import { autoSchedule, computeNotBeforeSoft } from './scheduler.service'
import { toLocalISO } from '../utils/datetime'
import type { SetScore } from '../../shared/types/match'

type DB = BetterSQLite3Database<typeof schema>

function simulateGame(p1WinPoint = 0.5): [number, number] {
  let s1 = 0
  let s2 = 0
  while (true) {
    if (s1 >= 21 && s1 - s2 >= 2) return [s1, s2]
    if (s2 >= 21 && s2 - s1 >= 2) return [s1, s2]
    if (s1 === 29 && s2 === 29) {
      return Math.random() < p1WinPoint ? [30, 29] : [29, 30]
    }
    if (Math.random() < p1WinPoint) s1++
    else s2++
  }
}

function simulateMatch(p1Strength: number): { sets: SetScore[]; winner: 1 | 2 } {
  const sets: SetScore[] = []
  let wins1 = 0
  let wins2 = 0
  while (wins1 < 2 && wins2 < 2) {
    const [s1, s2] = simulateGame(p1Strength)
    sets.push({ s1, s2 })
    if (s1 > s2) wins1++
    else wins2++
  }
  return { sets, winner: wins1 > wins2 ? 1 : 2 }
}

function durationMinutes(sets: SetScore[]): number {
  return Math.max(1, Math.round(sets.reduce((n, s) => n + s.s1 + s.s2, 0) / 2))
}

function addMinutes(isoDatetime: string, minutes: number): string {
  return toLocalISO(new Date(new Date(isoDatetime).getTime() + minutes * 60_000))
}

function getTournamentRoundIds(db: DB, tournamentId: string): string[] {
  const eventIds = db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()
    .map((e) => e.id)
  if (!eventIds.length) return []
  return db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, eventIds))
    .all()
    .map((r) => r.id)
}

function fixStuckScheduledMatches(db: DB, tournamentId: string): void {
  const roundIds = getTournamentRoundIds(db, tournamentId)
  if (!roundIds.length) return
  const stuck = db
    .select()
    .from(schema.matches)
    .where(inArray(schema.matches.round_id, roundIds))
    .all()
    .filter((m) => m.status === 'scheduled' && m.team1_id !== null && m.team2_id !== null)
  for (const m of stuck) {
    db.update(schema.matches).set({ status: 'ready' }).where(eq(schema.matches.id, m.id)).run()
  }
}

function readyScheduledMatches(db: DB, tournamentId: string) {
  const roundIds = getTournamentRoundIds(db, tournamentId)
  if (!roundIds.length) return []
  return db
    .select()
    .from(schema.matches)
    .where(inArray(schema.matches.round_id, roundIds))
    .all()
    .filter(
      (m) =>
        m.status === 'ready' &&
        m.scheduled_at !== null &&
        m.team1_id !== null &&
        m.team2_id !== null
    )
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!))
}

function computeP1Strength(
  db: DB,
  roundId: string,
  team1Id: string | null,
  team2Id: string | null
): number {
  const getSeed = (teamId: string | null): number | null => {
    if (!teamId) return null
    const rows = db
      .select({ round_id: schema.round_teams.round_id, seed: schema.round_teams.seed })
      .from(schema.round_teams)
      .where(eq(schema.round_teams.team_id, teamId))
      .all()
    const row = rows.find((r) => r.round_id === roundId && r.seed !== null && r.seed !== undefined)
    return row?.seed ?? null
  }
  const seed1 = getSeed(team1Id)
  const seed2 = getSeed(team2Id)
  let p = 0.5
  if (seed1 !== null && seed2 !== null) {
    p = 0.5 + (seed2 - seed1) * 0.03
  } else if (seed1 !== null) {
    p = 0.53
  } else if (seed2 !== null) {
    p = 0.47
  }
  return Math.min(0.85, Math.max(0.15, p))
}

function refreshNotBefore(
  db: DB,
  tournamentId: string,
  matchId: string,
  team1Id: string | null,
  team2Id: string | null,
  restMinutes: number
): void {
  const playerIds = [
    ...(team1Id
      ? db
          .select({ player_id: schema.team_players.player_id })
          .from(schema.team_players)
          .where(eq(schema.team_players.team_id, team1Id))
          .all()
          .map((r) => r.player_id)
      : []),
    ...(team2Id
      ? db
          .select({ player_id: schema.team_players.player_id })
          .from(schema.team_players)
          .where(eq(schema.team_players.team_id, team2Id))
          .all()
          .map((r) => r.player_id)
      : [])
  ]
  const uniquePlayers = Array.from(new Set(playerIds))
  if (!uniquePlayers.length) return

  const allTeamIds = db
    .select({ team_id: schema.team_players.team_id })
    .from(schema.team_players)
    .where(inArray(schema.team_players.player_id, uniquePlayers))
    .all()
    .map((r) => r.team_id)

  const roundIds = getTournamentRoundIds(db, tournamentId)
  if (!roundIds.length) return

  const affected = db
    .select()
    .from(schema.matches)
    .where(inArray(schema.matches.round_id, roundIds))
    .all()
    .filter((m) => {
      if (m.id === matchId || m.status !== 'ready') return false
      const teams = [m.team1_id, m.team2_id].filter(Boolean) as string[]
      return teams.some((tid) => allTeamIds.includes(tid))
    })

  for (const m of affected) {
    const soft = computeNotBeforeSoft(db, m.id, m.team1_id, m.team2_id, tournamentId, restMinutes)
    db.update(schema.matches).set({ not_before_soft: soft }).where(eq(schema.matches.id, m.id)).run()
  }
}

export interface SimulationResult {
  matchesPlayed: number
  remaining: number
}

export function simulateTournament(db: DB, tournamentId: string): SimulationResult {
  const tournament = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, tournamentId))
    .get()
  if (!tournament) throw new Error(`Tournament not found: ${tournamentId}`)

  const restMinutes = tournament.rest_minutes ?? 30
  const matchRepo = new MatchRepository(db)

  fixStuckScheduledMatches(db, tournamentId)
  autoSchedule(db, tournamentId)

  let totalPlayed = 0

  while (true) {
    const batch = readyScheduledMatches(db, tournamentId)
    if (!batch.length) break

    for (const match of batch) {
      const p1Strength = computeP1Strength(db, match.round_id, match.team1_id, match.team2_id)
      const { sets, winner } = simulateMatch(p1Strength)
      const dur = durationMinutes(sets)
      const actualStart = match.scheduled_at!
      const actualEnd = addMinutes(actualStart, dur)

      db.update(schema.matches)
        .set({ actual_start: actualStart, actual_end: actualEnd, status: 'live' })
        .where(eq(schema.matches.id, match.id))
        .run()

      matchRepo.updateResult(match.id, { status: 'finished', sets })

      const round = db
        .select({ type: schema.rounds.type })
        .from(schema.rounds)
        .where(eq(schema.rounds.id, match.round_id))
        .get()

      if (round?.type === 'playoff') {
        advanceWinner(db, match.id)
      } else {
        updateStandings(db, match.round_id)
      }

      refreshNotBefore(db, tournamentId, match.id, match.team1_id, match.team2_id, restMinutes)
      totalPlayed++
    }

    fixStuckScheduledMatches(db, tournamentId)
    autoSchedule(db, tournamentId)
  }

  const roundIds = getTournamentRoundIds(db, tournamentId)
  const remaining = roundIds.length
    ? db
        .select()
        .from(schema.matches)
        .where(inArray(schema.matches.round_id, roundIds))
        .all()
        .filter((m) => m.status === 'ready' || m.status === 'scheduled').length
    : 0

  return { matchesPlayed: totalPlayed, remaining }
}