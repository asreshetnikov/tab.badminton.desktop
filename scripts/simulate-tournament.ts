/**
 * Simulate a full tournament by playing all matches in chronological order.
 *
 * Scoring: badminton best-of-3 (each game first to 21, win by 2, max 30-29).
 * Duration: total_points / 2 minutes (e.g. 21-15, 21-18 → 75 pts → 38 min).
 * Courts: autoSchedule assigns courts; actual_start/actual_end track simulated time.
 *
 * Usage:
 *   npx tsx scripts/simulate-tournament.ts <tournament_id>
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, inArray } from 'drizzle-orm'
import { resolve } from 'path'
import { homedir } from 'os'
import * as schema from '../src/main/db/schema'
import { MatchRepository } from '../src/main/db/repositories/match.repo'
import { advanceWinner } from '../src/main/services/playoff.service'
import { updateStandings } from '../src/main/services/round-robin.service'
import { autoSchedule, computeNotBeforeSoft } from '../src/main/services/scheduler.service'
import { toLocalISO } from '../src/main/utils/datetime'
import type { SetScore } from '../src/shared/types/match'

// ── Config ────────────────────────────────────────────────────────────────────

const DB_PATH = resolve(homedir(), 'Library/Application Support/tab-badminton/tournament.db')

const tournamentId = process.argv[2]
if (!tournamentId) {
  console.error('Usage: npx tsx scripts/simulate-tournament.ts <tournament_id>')
  process.exit(1)
}

const sqlite = new Database(DB_PATH)
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

// ── Badminton scoring ─────────────────────────────────────────────────────────

/**
 * Simulate one badminton game (set).
 * Returns [s1, s2] where one side reaches 21 first (win by 2, max 30-29).
 * Scoring is point-by-point with configurable win probability.
 */
function simulateGame(p1WinPoint = 0.5): [number, number] {
  let s1 = 0
  let s2 = 0
  while (true) {
    // Check win conditions
    if (s1 >= 21 && s1 - s2 >= 2) return [s1, s2]
    if (s2 >= 21 && s2 - s1 >= 2) return [s1, s2]
    // At 29-29 the next point wins
    if (s1 === 29 && s2 === 29) {
      if (Math.random() < p1WinPoint) return [30, 29]
      else return [29, 30]
    }
    // Rally
    if (Math.random() < p1WinPoint) s1++
    else s2++
  }
}

/**
 * Simulate a best-of-3 match.
 * p1Strength: 0–1, probability that team1 wins each rally.
 * Returns { sets, winner } where winner is 1 or 2.
 */
function simulateMatch(p1Strength: number): { sets: SetScore[]; winner: 1 | 2 } {
  const sets: SetScore[] = []
  let wins1 = 0
  let wins2 = 0

  while (wins1 < 2 && wins2 < 2) {
    // Slight momentum: first game is "even", later games use the strength
    const [s1, s2] = simulateGame(p1Strength)
    sets.push({ s1, s2 })
    if (s1 > s2) wins1++
    else wins2++
  }

  return { sets, winner: wins1 > wins2 ? 1 : 2 }
}

/**
 * Match duration in minutes = total points played / 2.
 */
function durationMinutes(sets: SetScore[]): number {
  return Math.max(1, Math.round(sets.reduce((n, s) => n + s.s1 + s.s2, 0) / 2))
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function addMinutes(isoDatetime: string, minutes: number): string {
  return toLocalISO(new Date(new Date(isoDatetime).getTime() + minutes * 60_000))
}

/**
 * Fix matches that have both teams filled but status='scheduled' — a legacy artefact
 * of generateBracket not updating status when two consecutive walkovers propagated
 * into the same parent match. Safe to call repeatedly.
 */
function fixStuckScheduledMatches() {
  const eventIds = db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()
    .map((e) => e.id)
  if (!eventIds.length) return

  const roundIds = db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, eventIds))
    .all()
    .map((r) => r.id)
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
  if (stuck.length > 0) {
    console.log(`  (fixed ${stuck.length} matches stuck in scheduled-with-both-teams)`)
  }
}

/** All READY matches with both teams and a scheduled time, sorted by scheduled_at. */
function readyScheduledMatches() {
  const eventIds = db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()
    .map((e) => e.id)

  if (!eventIds.length) return []

  const roundIds = db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, eventIds))
    .all()
    .map((r) => r.id)

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

/** Enrich a match with round/event/team name info for logging. */
function matchLabel(matchId: string): string {
  const m = db.select().from(schema.matches).where(eq(schema.matches.id, matchId)).get()
  if (!m) return matchId
  const round = db.select().from(schema.rounds).where(eq(schema.rounds.id, m.round_id)).get()
  const event = round
    ? db.select().from(schema.events).where(eq(schema.events.id, round.event_id)).get()
    : null
  const t1 = m.team1_id
    ? db.select({ name: schema.teams.name }).from(schema.teams).where(eq(schema.teams.id, m.team1_id)).get()
    : null
  const t2 = m.team2_id
    ? db.select({ name: schema.teams.name }).from(schema.teams).where(eq(schema.teams.id, m.team2_id)).get()
    : null
  const cat = event?.category ?? '?'
  const roundName = round?.name ?? '?'
  return `[${cat}] ${roundName}: ${t1?.name ?? '?'} vs ${t2?.name ?? '?'}`
}

/** Recompute not_before_soft for all READY matches sharing players with a just-finished match. */
function refreshNotBefore(
  matchId: string,
  team1Id: string | null,
  team2Id: string | null,
  restMinutes: number
) {
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

  const eventIds = db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()
    .map((e) => e.id)
  if (!eventIds.length) return

  const roundIds = db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, eventIds))
    .all()
    .map((r) => r.id)
  if (!roundIds.length) return

  const affected = db
    .select()
    .from(schema.matches)
    .where(inArray(schema.matches.round_id, roundIds))
    .all()
    .filter((m) => {
      if (m.id === matchId) return false
      if (m.status !== 'ready') return false
      const teams = [m.team1_id, m.team2_id].filter(Boolean) as string[]
      return teams.some((tid) => allTeamIds.includes(tid))
    })

  for (const m of affected) {
    const soft = computeNotBeforeSoft(db, m.id, m.team1_id, m.team2_id, tournamentId, restMinutes)
    db.update(schema.matches).set({ not_before_soft: soft }).where(eq(schema.matches.id, m.id)).run()
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const tournament = db
  .select()
  .from(schema.tournaments)
  .where(eq(schema.tournaments.id, tournamentId))
  .get()
if (!tournament) {
  console.error(`Tournament not found: ${tournamentId}`)
  process.exit(1)
}

const restMinutes = tournament.rest_minutes ?? 30
const matchRepo = new MatchRepository(db)

console.log(`\nSimulating: "${tournament.name}" (${tournamentId})`)
console.log(`Rest between matches: ${restMinutes} min\n`)
console.log('Phase 0 — initial autoSchedule...')
fixStuckScheduledMatches()
autoSchedule(db, tournamentId)

let totalPlayed = 0
let wave = 0

while (true) {
  const batch = readyScheduledMatches()
  if (!batch.length) break

  wave++
  console.log(`\n── Wave ${wave} (${batch.length} match${batch.length > 1 ? 'es' : ''} ready) ──`)

  for (const match of batch) {
    // Random strength: each match is a fair coin toss (0.5 ± small noise for realism)
    const p1Strength = 0.35 + Math.random() * 0.3 // 0.35–0.65
    const { sets, winner } = simulateMatch(p1Strength)
    const dur = durationMinutes(sets)

    const actualStart = match.scheduled_at!
    const actualEnd = addMinutes(actualStart, dur)
    const winnerTeamId = winner === 1 ? match.team1_id! : match.team2_id!

    // 1. Persist actual times before updateResult (needed by computeNotBeforeSoft)
    db.update(schema.matches)
      .set({ actual_start: actualStart, actual_end: actualEnd, status: 'live' })
      .where(eq(schema.matches.id, match.id))
      .run()

    // 2. Save result (sets, s1/s2 game count, winner, status=finished)
    matchRepo.updateResult(match.id, { status: 'finished', sets })

    // 3. Advance winner / update standings depending on round type
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

    // 4. Update not_before_soft for players involved
    refreshNotBefore(match.id, match.team1_id, match.team2_id, restMinutes)

    totalPlayed++
    const label = matchLabel(match.id)
    const setStr = sets.map((s) => `${s.s1}:${s.s2}`).join('  ')
    const winStr = winner === 1 ? 'T1 wins' : 'T2 wins'
    console.log(`  ${actualStart.slice(11, 16)}–${actualEnd.slice(11, 16)} (${dur}min)  ${setStr}  ${winStr}  ${label}`)
  }

  // Fix any newly-ready matches, then reschedule
  fixStuckScheduledMatches()
  console.log(`  → autoSchedule...`)
  autoSchedule(db, tournamentId)
}

// Summary
const eventIds = db
  .select({ id: schema.events.id })
  .from(schema.events)
  .where(eq(schema.events.tournament_id, tournamentId))
  .all()
  .map((e) => e.id)

const roundIds = eventIds.length
  ? db
      .select({ id: schema.rounds.id })
      .from(schema.rounds)
      .where(inArray(schema.rounds.event_id, eventIds))
      .all()
      .map((r) => r.id)
  : []

const remaining = roundIds.length
  ? db
      .select()
      .from(schema.matches)
      .where(inArray(schema.matches.round_id, roundIds))
      .all()
      .filter((m) => m.status === 'ready' || m.status === 'scheduled')
  : []

console.log(`\n✓ Done. Simulated ${totalPlayed} matches.`)
if (remaining.length > 0) {
  console.log(`  ${remaining.length} match(es) still unscheduled/not-ready (missing teams or no schedule yet).`)
}
console.log('  Open the app and go to the Schedule screen to review the result.\n')
