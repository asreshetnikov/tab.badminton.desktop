import { eq, isNotNull, inArray } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import type { MatchSlot } from '@shared/types/schedule'

export interface AssignSlotDTO {
  courtId: string | null
  datetime: string | null // ISO datetime string e.g. "2026-04-14T10:00:00"
}

export interface ConflictInfo {
  matchId: string
  scheduledAt: string
}

/**
 * Assign a court and datetime slot to a match.
 */
export function assignSlot(
  db: BetterSQLite3Database<typeof schema>,
  matchId: string,
  dto: AssignSlotDTO
): void {
  db.update(schema.matches)
    .set({ court_id: dto.courtId, scheduled_at: dto.datetime })
    .where(eq(schema.matches.id, matchId))
    .run()
}

/**
 * Check for scheduling conflicts for a given team at a proposed time slot.
 *
 * A conflict occurs when any player in the team is already involved in another
 * scheduled match whose time window overlaps with [datetime, datetime + duration).
 * Duration is assumed equal for all matches (since it is not stored in the schema).
 *
 * @param matchId  - the match being scheduled (excluded from results)
 * @param teamId   - the team to check
 * @param datetime - proposed start time (ISO string)
 * @param duration - match duration in minutes
 * @returns list of conflicting already-scheduled matches
 */
export function validateConflicts(
  db: BetterSQLite3Database<typeof schema>,
  matchId: string,
  params: { teamId: string; datetime: string; duration: number }
): ConflictInfo[] {
  const { teamId, datetime, duration } = params

  // Step 1: find all player IDs in the given team
  const playerRows = db
    .select({ player_id: schema.team_players.player_id })
    .from(schema.team_players)
    .where(eq(schema.team_players.team_id, teamId))
    .all()

  if (playerRows.length === 0) return []
  const playerIds = playerRows.map((r) => r.player_id)

  // Step 2: find all team IDs that share at least one player
  const sharedTeamRows = db
    .select({ team_id: schema.team_players.team_id })
    .from(schema.team_players)
    .where(inArray(schema.team_players.player_id, playerIds))
    .all()

  const sharedTeamIds = [...new Set(sharedTeamRows.map((r) => r.team_id))]

  // Step 3: fetch all already-scheduled matches (have a scheduled_at)
  const scheduledMatches = db
    .select({
      id: schema.matches.id,
      scheduled_at: schema.matches.scheduled_at,
      team1_id: schema.matches.team1_id,
      team2_id: schema.matches.team2_id
    })
    .from(schema.matches)
    .where(isNotNull(schema.matches.scheduled_at))
    .all()

  const proposedStart = new Date(datetime).getTime()
  const proposedEnd = proposedStart + duration * 60 * 1000

  const conflicts: ConflictInfo[] = []

  for (const m of scheduledMatches) {
    if (m.id === matchId) continue
    if (!m.scheduled_at) continue

    const involvesSharedPlayer =
      (m.team1_id !== null && sharedTeamIds.includes(m.team1_id)) ||
      (m.team2_id !== null && sharedTeamIds.includes(m.team2_id))

    if (!involvesSharedPlayer) continue

    // Two intervals [A, A+d) and [B, B+d) overlap iff A < B+d AND B < A+d
    const otherStart = new Date(m.scheduled_at).getTime()
    const otherEnd = otherStart + duration * 60 * 1000

    if (proposedStart < otherEnd && otherStart < proposedEnd) {
      conflicts.push({ matchId: m.id, scheduledAt: m.scheduled_at })
    }
  }

  return conflicts
}

// ─── Order of Play ────────────────────────────────────────────────────────────

/**
 * For a playoff round, compute the bracket round number for each match.
 * bracketRound 1 = first round (leaf nodes), increasing toward the final.
 * Uses BFS starting from the final match (the one with win_match_id = null).
 */
function computeBracketRounds(
  matchesInRound: Array<{
    id: string
    win_match_id: string | null
    left_match_id: string | null
    right_match_id: string | null
  }>
): Map<string, number> {
  const final = matchesInRound.find((m) => m.win_match_id === null)
  if (!final) return new Map()

  const matchMap = new Map(matchesInRound.map((m) => [m.id, m]))
  const levelFromFinal = new Map<string, number>()
  const queue: Array<{ id: string; level: number }> = [{ id: final.id, level: 0 }]

  while (queue.length > 0) {
    const { id, level } = queue.shift()!
    levelFromFinal.set(id, level)
    const m = matchMap.get(id)
    if (m?.left_match_id) queue.push({ id: m.left_match_id, level: level + 1 })
    if (m?.right_match_id) queue.push({ id: m.right_match_id, level: level + 1 })
  }

  const maxLevel = Math.max(...levelFromFinal.values())
  const result = new Map<string, number>()
  levelFromFinal.forEach((level, id) => {
    result.set(id, maxLevel - level + 1) // 1 = first round, maxLevel+1 = final
  })
  return result
}

/**
 * Build a full list of MatchSlot objects for every match belonging to the
 * given tournament (across all events and rounds).
 */
function getMatchesForTournament(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string
): MatchSlot[] {
  const events = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()

  if (events.length === 0) return []
  const eventIds = events.map((e) => e.id)

  const rounds = db
    .select()
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, eventIds))
    .all()

  if (rounds.length === 0) return []
  const roundIds = rounds.map((r) => r.id)

  const matches = db
    .select()
    .from(schema.matches)
    .where(inArray(schema.matches.round_id, roundIds))
    .all()

  if (matches.length === 0) return []

  // Per-set scores
  const matchIds = matches.map((m) => m.id)
  const allSets = db
    .select()
    .from(schema.match_sets)
    .where(inArray(schema.match_sets.match_id, matchIds))
    .all()
  const setsMap = new Map<string, { s1: number; s2: number }[]>()
  for (const s of allSets) {
    const arr = setsMap.get(s.match_id) ?? []
    arr.push({ s1: s.s1, s2: s.s2 })
    setsMap.set(s.match_id, arr)
  }

  // Courts
  const courts = db
    .select()
    .from(schema.courts)
    .where(eq(schema.courts.tournament_id, tournamentId))
    .all()
  const courtMap = new Map(courts.map((c) => [c.id, c.name]))

  // Teams
  const teamIds = [
    ...new Set([
      ...(matches.map((m) => m.team1_id).filter(Boolean) as string[]),
      ...(matches.map((m) => m.team2_id).filter(Boolean) as string[])
    ])
  ]
  const teamMap = new Map<string, string>()
  if (teamIds.length > 0) {
    db.select({ id: schema.teams.id, name: schema.teams.name })
      .from(schema.teams)
      .where(inArray(schema.teams.id, teamIds))
      .all()
      .forEach((t) => teamMap.set(t.id, t.name))
  }

  const roundMap = new Map(rounds.map((r) => [r.id, r]))
  const eventMap = new Map(events.map((e) => [e.id, e]))

  // Pre-compute bracketRound for each playoff round
  const bracketRoundsByRound = new Map<string, Map<string, number>>()
  for (const round of rounds) {
    if (round.type === 'playoff') {
      const roundMatches = matches.filter((m) => m.round_id === round.id)
      bracketRoundsByRound.set(round.id, computeBracketRounds(roundMatches))
    }
  }

  return matches.map((m) => {
    const round = roundMap.get(m.round_id)!
    const event = eventMap.get(round.event_id)!
    const bracketRound = bracketRoundsByRound.get(round.id)?.get(m.id) ?? null
    return {
      id: m.id,
      scheduledAt: m.scheduled_at,
      courtId: m.court_id,
      courtName: m.court_id ? (courtMap.get(m.court_id) ?? null) : null,
      team1Id: m.team1_id,
      team1Name: m.team1_id ? (teamMap.get(m.team1_id) ?? null) : null,
      team2Id: m.team2_id,
      team2Name: m.team2_id ? (teamMap.get(m.team2_id) ?? null) : null,
      status: m.status,
      s1: m.s1,
      s2: m.s2,
      sets: setsMap.get(m.id) ?? [],
      winnerTeamId: m.winner_team_id,
      eventId: event.id,
      eventName: event.name,
      eventCategory: event.category,
      roundId: round.id,
      roundName: round.name,
      roundType: round.type,
      roundOrder: round.order,
      tour: m.tour,
      bracketRound,
      notBeforeHard: m.not_before_hard,
      notBeforeSoft: m.not_before_soft,
      actualStart: m.actual_start,
      actualEnd: m.actual_end,
      priority: null,
      queuePosition: m.queue_position ?? null,
      leftMatchId: m.left_match_id,
      rightMatchId: m.right_match_id
    }
  })
}

/**
 * Bulk-update queue_position for a list of matches.
 * Runs in a single transaction.
 */
export function setQueuePositions(
  db: BetterSQLite3Database<typeof schema>,
  positions: Array<{ matchId: string; position: number }>
): void {
  for (const { matchId, position } of positions) {
    db.update(schema.matches)
      .set({ queue_position: position })
      .where(eq(schema.matches.id, matchId))
      .run()
  }
}

/**
 * Return all matches for a tournament that are scheduled on the given date.
 * @param date - "YYYY-MM-DD"
 */
export function getOrderOfPlay(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string,
  date: string
): MatchSlot[] {
  return getMatchesForTournament(db, tournamentId).filter(
    (m) => m.scheduledAt !== null && m.scheduledAt.startsWith(date)
  )
}

/**
 * Return all matches for a tournament that have a scheduled time,
 * excluding walkovers (bye matches that never had real players).
 */
export function listScheduled(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string
): MatchSlot[] {
  return getMatchesForTournament(db, tournamentId).filter(
    (m) => m.scheduledAt !== null && m.status !== 'walkover'
  )
}

/**
 * Return all matches for a tournament that have no scheduled time
 * and are not walkovers (i.e. still need to be placed in the schedule).
 */
export function listUnscheduled(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string
): MatchSlot[] {
  return getMatchesForTournament(db, tournamentId).filter(
    (m) => m.scheduledAt === null && m.status !== 'walkover'
  )
}
