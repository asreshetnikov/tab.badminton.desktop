/**
 * Playoff Scheduler Service
 *
 * Implements the priority-based scheduling algorithm for single-elimination brackets.
 *
 * Sort order (descending priority):
 *   1. category_depth  — rounds remaining until final (final=1, semi=2, quarter=3, ...)
 *                        earlier rounds → more downstream matches blocked → scheduled first
 *   2. cross_pending   — max over players: unfinished matches in OTHER events
 *                        players competing in many categories get earlier slots
 *   3. effective_not_before ASC — tie-breaker: earliest available player wins
 *
 * Category affinity (block scheduling) applies only to R32 and earlier (large brackets
 * with 5+ rounds). From R16 onward pure priority ordering is used so that players
 * competing across multiple categories are not bottlenecked at the end.
 *
 * not_before_soft(match) = max over all players: last_end(player) + rest_minutes
 * effective_not_before   = max(not_before_soft, not_before_hard)
 */

import { eq, inArray, and, notInArray } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { toLocalISO, toLocalDateStr } from '../utils/datetime'
import { setQueuePositions } from './schedule.service'
import { getAppSettings } from './app-settings.service'

const DEFAULT_START_TIME = '09:00'

/** Tracks when a specific court next becomes available. */
type CourtSlot = { courtId: string; endTime: number }

const DONE_STATUSES = ['finished', 'walkover', 'retired'] as const
type DoneStatus = (typeof DONE_STATUSES)[number]

function isDone(status: string): status is DoneStatus {
  return (DONE_STATUSES as readonly string[]).includes(status)
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Get all player IDs for a given team (via team_players).
 */
function getPlayerIdsForTeam(
  db: BetterSQLite3Database<typeof schema>,
  teamId: string
): string[] {
  return db
    .select({ player_id: schema.team_players.player_id })
    .from(schema.team_players)
    .where(eq(schema.team_players.team_id, teamId))
    .all()
    .map((r) => r.player_id)
}

/**
 * Get all player IDs participating in a match (from both teams).
 */
function getPlayerIdsForMatch(
  db: BetterSQLite3Database<typeof schema>,
  team1Id: string | null,
  team2Id: string | null
): string[] {
  const ids: string[] = []
  if (team1Id) ids.push(...getPlayerIdsForTeam(db, team1Id))
  if (team2Id) ids.push(...getPlayerIdsForTeam(db, team2Id))
  return [...new Set(ids)]
}

/**
 * Get the day start datetime for a given date string (YYYY-MM-DD).
 * Falls back to DEFAULT_START_TIME if no setting found.
 */
function getDayStart(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string,
  date: string
): Date {
  const setting = db
    .select()
    .from(schema.tournament_day_settings)
    .where(
      and(
        eq(schema.tournament_day_settings.tournament_id, tournamentId),
        eq(schema.tournament_day_settings.date, date)
      )
    )
    .get()
  const time = setting?.start_time ?? DEFAULT_START_TIME
  return new Date(`${date}T${time}:00`)
}

/**
 * Get match duration (in minutes) for a given bracket round.
 * Falls back to day setting or app-level defaultMatchDuration setting.
 */
function getMatchDuration(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string,
  bracketRound: number | null,
  date: string
): number {
  if (bracketRound !== null) {
    const stageDuration = db
      .select()
      .from(schema.tournament_stage_durations)
      .where(
        and(
          eq(schema.tournament_stage_durations.tournament_id, tournamentId),
          eq(schema.tournament_stage_durations.bracket_round, bracketRound)
        )
      )
      .get()
    if (stageDuration) return stageDuration.duration_minutes
  }
  const daySetting = db
    .select()
    .from(schema.tournament_day_settings)
    .where(
      and(
        eq(schema.tournament_day_settings.tournament_id, tournamentId),
        eq(schema.tournament_day_settings.date, date)
      )
    )
    .get()
  return daySetting?.match_duration ?? getAppSettings().defaultMatchDuration
}

/**
 * Compute bracket rounds for playoff matches in a round.
 * bracketRound 1 = first round (leaves), increasing toward the final.
 * Returns Map<matchId, bracketRound>.
 */
function computeBracketRoundsForRound(
  matches: Array<{
    id: string
    win_match_id: string | null
    left_match_id: string | null
    right_match_id: string | null
  }>
): Map<string, number> {
  const final = matches.find((m) => m.win_match_id === null)
  if (!final) return new Map()

  const matchMap = new Map(matches.map((m) => [m.id, m]))
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

// ─── Core computations ────────────────────────────────────────────────────────

/**
 * Compute category_depth for a match:
 * = maxBracketRound - bracketRound + 1
 * (final=1, semi=2, quarter=3, ...) — higher means more matches blocked
 */
function computeCategoryDepth(bracketRound: number, maxBracketRound: number): number {
  return maxBracketRound - bracketRound + 1
}

/**
 * Compute cross_pending for a single player:
 * count of unfinished matches in events OTHER than currentEventId.
 */
function computeCrossPending(
  db: BetterSQLite3Database<typeof schema>,
  playerId: string,
  currentEventId: string,
  tournamentId: string
): number {
  // All teams this player is in
  const playerTeamIds = db
    .select({ team_id: schema.team_players.team_id })
    .from(schema.team_players)
    .where(eq(schema.team_players.player_id, playerId))
    .all()
    .map((r) => r.team_id)

  if (playerTeamIds.length === 0) return 0

  // All events for this tournament except the current one
  const otherEvents = db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.tournament_id, tournamentId),
        notInArray(schema.events.id, [currentEventId])
      )
    )
    .all()
    .map((e) => e.id)

  if (otherEvents.length === 0) return 0

  // Rounds in those other events
  const otherRounds = db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, otherEvents))
    .all()
    .map((r) => r.id)

  if (otherRounds.length === 0) return 0

  // Matches in those rounds where this player participates and match is not done
  const allMatchesInOtherRounds = db
    .select({
      id: schema.matches.id,
      status: schema.matches.status,
      team1_id: schema.matches.team1_id,
      team2_id: schema.matches.team2_id
    })
    .from(schema.matches)
    .where(inArray(schema.matches.round_id, otherRounds))
    .all()

  let count = 0
  for (const m of allMatchesInOtherRounds) {
    if (isDone(m.status)) continue
    const involvedTeams = [m.team1_id, m.team2_id].filter(Boolean) as string[]
    const playerInvolved = involvedTeams.some((tid) => playerTeamIds.includes(tid))
    if (playerInvolved) count++
  }
  return count
}

/**
 * Compute not_before_soft for a match:
 * = max over all players of (last_end(player) + rest_minutes)
 *
 * last_end(player):
 *   - max(actual_end) of COMPLETED matches, OR
 *   - max(scheduled_at + duration) of still-scheduled matches to account for upcoming
 *   - falls back to day_start if nothing found
 */
export function computeNotBeforeSoft(
  db: BetterSQLite3Database<typeof schema>,
  matchId: string,
  team1Id: string | null,
  team2Id: string | null,
  tournamentId: string,
  restMinutes: number
): string | null {
  const playerIds = getPlayerIdsForMatch(db, team1Id, team2Id)
  if (playerIds.length === 0) return null

  // All team IDs these players are in
  const allTeamIds = db
    .select({ team_id: schema.team_players.team_id })
    .from(schema.team_players)
    .where(inArray(schema.team_players.player_id, playerIds))
    .all()
    .map((r) => r.team_id)

  if (allTeamIds.length === 0) return null

  // Get all rounds for this tournament
  const allEventIds = db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()
    .map((e) => e.id)

  if (allEventIds.length === 0) return null

  const allRoundIds = db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, allEventIds))
    .all()
    .map((r) => r.id)

  if (allRoundIds.length === 0) return null

  // Get all matches for these players (excluding the current match)
  const playerMatches = db
    .select({
      id: schema.matches.id,
      status: schema.matches.status,
      scheduled_at: schema.matches.scheduled_at,
      actual_end: schema.matches.actual_end,
      team1_id: schema.matches.team1_id,
      team2_id: schema.matches.team2_id,
      round_id: schema.matches.round_id
    })
    .from(schema.matches)
    .where(inArray(schema.matches.round_id, allRoundIds))
    .all()
    .filter((m) => {
      if (m.id === matchId) return false
      const involvedTeams = [m.team1_id, m.team2_id].filter(Boolean) as string[]
      return involvedTeams.some((tid) => allTeamIds.includes(tid))
    })

  // Compute last_end per player, then take max(last_end + rest) across all players
  let maxNotBefore: number | null = null

  for (const playerId of playerIds) {
    // Teams this player is in
    const pTeamIds = db
      .select({ team_id: schema.team_players.team_id })
      .from(schema.team_players)
      .where(eq(schema.team_players.player_id, playerId))
      .all()
      .map((r) => r.team_id)

    const pMatches = playerMatches.filter((m) => {
      const involvedTeams = [m.team1_id, m.team2_id].filter(Boolean) as string[]
      return involvedTeams.some((tid) => pTeamIds.includes(tid))
    })

    let lastEndMs: number | null = null

    for (const m of pMatches) {
      if (isDone(m.status) && m.actual_end) {
        const endMs = new Date(m.actual_end).getTime()
        if (lastEndMs === null || endMs > lastEndMs) lastEndMs = endMs
      } else if (!isDone(m.status) && m.scheduled_at) {
        // Estimate end as scheduled_at + default duration
        const scheduledMs = new Date(m.scheduled_at).getTime()
        const duration = getAppSettings().defaultMatchDuration * 60 * 1000
        const estimatedEnd = scheduledMs + duration
        if (lastEndMs === null || estimatedEnd > lastEndMs) lastEndMs = estimatedEnd
      }
    }

    // If no prior matches for this player, they can start at dayStart — no rest needed.
    // Rest is only required after an actual match has been played.
    if (lastEndMs === null) continue

    const notBeforeMs = lastEndMs + restMinutes * 60 * 1000
    if (maxNotBefore === null || notBeforeMs > maxNotBefore) maxNotBefore = notBeforeMs
  }

  if (maxNotBefore === null) return null
  return toLocalISO(new Date(maxNotBefore))
}

/**
 * Compute effective_not_before = max(not_before_soft, not_before_hard)
 */
function computeEffectiveNotBefore(
  notBeforeSoft: string | null,
  notBeforeHard: string | null,
  fallback: Date
): Date {
  const candidates: number[] = [fallback.getTime()]
  if (notBeforeSoft) candidates.push(new Date(notBeforeSoft).getTime())
  if (notBeforeHard) candidates.push(new Date(notBeforeHard).getTime())
  return new Date(Math.max(...candidates))
}

// ─── Main exported functions ──────────────────────────────────────────────────

/**
 * Update actual_start and actual_end for a completed match,
 * then recompute not_before_soft for all READY matches that share players.
 *
 * Called after matches:updateResult for playoff matches.
 */
export function onMatchCompleted(
  db: BetterSQLite3Database<typeof schema>,
  matchId: string,
  tournamentId: string
): void {
  const now = toLocalISO(new Date())

  const match = db.select().from(schema.matches).where(eq(schema.matches.id, matchId)).get()
  if (!match) return

  // Set actual times
  db.update(schema.matches)
    .set({
      actual_end: now,
      actual_start: match.actual_start ?? match.scheduled_at ?? now
    })
    .where(eq(schema.matches.id, matchId))
    .run()

  const tournament = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, tournamentId))
    .get()
  const restMinutes = tournament?.rest_minutes ?? 30

  // Find all READY matches for this tournament that involve the same players
  const playerIds = getPlayerIdsForMatch(db, match.team1_id, match.team2_id)
  if (playerIds.length === 0) return

  // Get all team IDs for these players
  const allTeamIds = db
    .select({ team_id: schema.team_players.team_id })
    .from(schema.team_players)
    .where(inArray(schema.team_players.player_id, playerIds))
    .all()
    .map((r) => r.team_id)

  if (allTeamIds.length === 0) return

  // Get all rounds for this tournament
  const allEventIds = db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()
    .map((e) => e.id)

  if (allEventIds.length === 0) return

  const allRoundIds = db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, allEventIds))
    .all()
    .map((r) => r.id)

  if (allRoundIds.length === 0) return

  // Find all non-finished matches involving these players
  const affectedMatches = db
    .select()
    .from(schema.matches)
    .where(inArray(schema.matches.round_id, allRoundIds))
    .all()
    .filter((m) => {
      if (m.id === matchId) return false
      if (m.status !== 'ready') return false
      const involvedTeams = [m.team1_id, m.team2_id].filter(Boolean) as string[]
      return involvedTeams.some((tid) => allTeamIds.includes(tid))
    })

  // Recompute not_before_soft for each affected match
  for (const m of affectedMatches) {
    const notBeforeSoft = computeNotBeforeSoft(
      db,
      m.id,
      m.team1_id,
      m.team2_id,
      tournamentId,
      restMinutes
    )
    db.update(schema.matches)
      .set({ not_before_soft: notBeforeSoft })
      .where(eq(schema.matches.id, m.id))
      .run()
  }
}

/**
 * Full auto-schedule triggered by the "Auto Schedule" button.
 *
 * Three-phase approach:
 *   0. Clear all non-done scheduled_at / court_id for a clean slate.
 *   1. Schedule round-robin matches tour by tour (N per slot, courts assigned cyclically).
 *      Each tour has no player conflicts because each player appears once per tour.
 *   2. Smart-schedule READY playoff matches (both teams known) using priority queue.
 *      Each match is assigned to the earliest-free court.
 *   3. Pre-schedule non-READY playoff bracket matches (future rounds, players unknown).
 *      All rounds share a single timeline starting after phase 2.
 */
export function autoSchedule(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string
): void {
  const courts = db
    .select()
    .from(schema.courts)
    .where(eq(schema.courts.tournament_id, tournamentId))
    .all()

  if (courts.length === 0) return

  const tournament = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, tournamentId))
    .get()
  if (!tournament) return

  const allEvents = db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()

  if (allEvents.length === 0) return

  const allRounds = db
    .select()
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, allEvents.map((e) => e.id)))
    .all()

  const allRoundIds = allRounds.map((r) => r.id)

  // Phase 0: clear all non-done scheduled_at and court_id for a clean slate
  if (allRoundIds.length > 0) {
    db.update(schema.matches)
      .set({ scheduled_at: null, court_id: null })
      .where(
        and(
          inArray(schema.matches.round_id, allRoundIds),
          notInArray(schema.matches.status, ['finished', 'walkover', 'retired'])
        )
      )
      .run()
  }

  const restMinutes = tournament.rest_minutes ?? 30
  const defaultDate = tournament.date_start
  const dayStartMs = getDayStart(db, tournamentId, defaultDate).getTime()

  // Each court tracks when it becomes free next; all start from dayStart.
  let courtSlots: CourtSlot[] = courts.map((c) => ({ courtId: c.id, endTime: dayStartMs }))

  // Phase 1: schedule round-robin rounds tour by tour
  const rrRounds = allRounds.filter((r) => r.type === 'round_robin')
  if (rrRounds.length > 0) {
    courtSlots = _scheduleRoundRobin(db, tournamentId, rrRounds, courtSlots)
  }

  // Phase 2: smart-schedule READY playoff matches with priority queue + court assignment
  const playoffRounds = allRounds.filter((r) => r.type === 'playoff')
  if (playoffRounds.length > 0) {
    courtSlots = _runScheduler(db, tournamentId, restMinutes, defaultDate, playoffRounds, courtSlots)
  }

  // Phase 3: pre-schedule non-READY playoff bracket matches (players not yet known).
  // Uses per-court end times so courts freed earlier don't sit idle.
  if (playoffRounds.length > 0) {
    _preScheduleBracket(db, tournamentId, playoffRounds, courtSlots, restMinutes)
  }

  // Phase 4: assign queue_position to all queued matches in scheduled_at order
  // so the queue sort is stable and reflects the auto-scheduled order.
  computeAndSaveQueuePositions(db, tournamentId)
}

/**
 * Compute and persist queue_position for every queued (scheduled/ready) match
 * in the tournament, ordered by scheduled_at ASC (nulls last), then by id ASC
 * as a stable tiebreaker.
 *
 * Called after autoSchedule and can also be called standalone.
 */
export function computeAndSaveQueuePositions(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string
): void {
  const allEvents = db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()

  if (allEvents.length === 0) return

  const allRoundIds = db
    .select({ id: schema.rounds.id })
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, allEvents.map((e) => e.id)))
    .all()
    .map((r) => r.id)

  if (allRoundIds.length === 0) return

  const queuedMatches = db
    .select({ id: schema.matches.id, scheduled_at: schema.matches.scheduled_at })
    .from(schema.matches)
    .where(
      and(
        inArray(schema.matches.round_id, allRoundIds),
        notInArray(schema.matches.status, ['live', 'finished', 'walkover', 'retired'])
      )
    )
    .all()

  // Sort: scheduled_at ASC (null → end), stable tiebreaker by id
  queuedMatches.sort((a, b) => {
    const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity
    const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity
    if (ta !== tb) return ta - tb
    return a.id < b.id ? -1 : 1
  })

  setQueuePositions(
    db,
    queuedMatches.map((m, i) => ({ matchId: m.id, position: i }))
  )
}

// ─── Internal scheduling helpers ─────────────────────────────────────────────

/**
 * Schedule all round-robin matches tour by tour using slot-fill.
 *
 * Each player appears exactly once per tour, so matches within the same tour
 * never conflict. Matches are processed in ascending tour order and assigned
 * to the earliest-free court, so no court sits idle unnecessarily.
 *
 * Returns the updated court slots after all RR matches are assigned.
 */
function _scheduleRoundRobin(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string,
  rrRounds: Array<{ id: string }>,
  initialCourtSlots: CourtSlot[]
): CourtSlot[] {
  // All ready (both teams known) RR matches
  const rrMatches = db
    .select()
    .from(schema.matches)
    .where(
      and(
        inArray(schema.matches.round_id, rrRounds.map((r) => r.id)),
        notInArray(schema.matches.status, ['finished', 'walkover', 'retired'])
      )
    )
    .all()
    .filter((m) => m.status === 'ready')

  if (rrMatches.length === 0) return initialCourtSlots

  // Group by tour number, ascending — ensures tour T completes before tour T+1 starts
  const byTour = new Map<number, typeof rrMatches>()
  for (const m of rrMatches) {
    const tour = m.tour ?? 1
    if (!byTour.has(tour)) byTour.set(tour, [])
    byTour.get(tour)!.push(m)
  }
  const sortedTours = [...byTour.keys()].sort((a, b) => a - b)

  const slots: CourtSlot[] = initialCourtSlots.map((s) => ({ ...s }))

  for (const tour of sortedTours) {
    const tourMatches = byTour.get(tour)!

    for (const m of tourMatches) {
      slots.sort((a, b) => a.endTime - b.endTime)
      const slot = slots[0]
      const scheduledDate = toLocalDateStr(new Date(slot.endTime))
      const duration = getMatchDuration(db, tournamentId, null, scheduledDate)

      db.update(schema.matches)
        .set({
          scheduled_at: toLocalISO(new Date(slot.endTime))
        })
        .where(eq(schema.matches.id, m.id))
        .run()

      slots[0] = { ...slot, endTime: slot.endTime + duration * 60 * 1000 }
    }
  }

  return slots
}

/**
 * Smart-schedule READY playoff matches (both teams known) using a priority queue.
 *
 * Assigns each match to the earliest-free court, respecting:
 *   - effective_not_before (player rest after previous match)
 *   - priority (category_depth + cross_pending)
 *
 * Returns the updated court slots after all READY matches are assigned.
 */
function _runScheduler(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string,
  restMinutes: number,
  defaultDate: string,
  playoffRounds: Array<{ id: string }>,
  initialCourtSlots: CourtSlot[]
): CourtSlot[] {
  if (playoffRounds.length === 0) return initialCourtSlots

  // Load all matches in playoff rounds
  const allMatches = db
    .select()
    .from(schema.matches)
    .where(inArray(schema.matches.round_id, playoffRounds.map((r) => r.id)))
    .all()

  // Compute bracket rounds for each round
  const bracketRoundByMatch = new Map<string, number>()
  const maxBracketRoundByRound = new Map<string, number>()
  for (const round of playoffRounds) {
    const roundMatches = allMatches.filter((m) => m.round_id === round.id)
    const bracketRounds = computeBracketRoundsForRound(roundMatches)
    bracketRounds.forEach((br, mid) => bracketRoundByMatch.set(mid, br))
    if (bracketRounds.size > 0) {
      maxBracketRoundByRound.set(round.id, Math.max(...bracketRounds.values()))
    }
  }

  // Build event lookup for cross_pending computation and category affinity
  const allEventIds = db
    .select({ id: schema.events.id, category: schema.events.category })
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()

  const categoryByEvent = new Map(allEventIds.map((e) => [e.id, e.category]))

  const allRounds = db
    .select()
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, allEventIds.map((e) => e.id)))
    .all()

  const eventByRound = new Map(allRounds.map((r) => [r.id, r.event_id]))

  // READY matches: both teams known (status === 'ready'), not finished
  const readyMatches = allMatches.filter((m) => m.status === 'ready')

  if (readyMatches.length === 0) return initialCourtSlots

  // Recompute not_before_soft for all ready matches.
  // Because we cleared scheduled_at in phase 0, only actual_end of completed
  // matches contributes — so preliminary slots no longer inflate not_before_soft.
  const dayStart = getDayStart(db, tournamentId, defaultDate)
  for (const m of readyMatches) {
    const notBeforeSoft = computeNotBeforeSoft(
      db, m.id, m.team1_id, m.team2_id, tournamentId, restMinutes
    )
    db.update(schema.matches)
      .set({ not_before_soft: notBeforeSoft })
      .where(eq(schema.matches.id, m.id))
      .run()
    m.not_before_soft = notBeforeSoft
  }

  // Compute priority for each match
  const matchesWithPriority = readyMatches.map((m) => {
    const bracketRound = bracketRoundByMatch.get(m.id) ?? 1
    const maxBracketRound = maxBracketRoundByRound.get(m.round_id) ?? 1
    const categoryDepth = computeCategoryDepth(bracketRound, maxBracketRound)
    const eventId = eventByRound.get(m.round_id) ?? ''
    const category = categoryByEvent.get(eventId) ?? ''

    const playerIds = getPlayerIdsForMatch(db, m.team1_id, m.team2_id)
    const crossPending =
      playerIds.length > 0
        ? Math.max(...playerIds.map((pid) => computeCrossPending(db, pid, eventId, tournamentId)))
        : 0

    const priority = categoryDepth + crossPending
    const effectiveNotBefore = computeEffectiveNotBefore(m.not_before_soft, m.not_before_hard, dayStart)

    // "Early round" = R32 or earlier: enough matches to fill multiple court slots.
    // Condition: maxBracketRound - bracketRound >= 4 (≥16 matches in that round).
    // Only applies to brackets with 5+ rounds (≥32 players), not small brackets.
    const isEarlyRound = maxBracketRound - bracketRound >= 4

    return { match: m, priority, categoryDepth, crossPending, effectiveNotBefore, bracketRound, category, isEarlyRound }
  })

  // Sort: categoryDepth desc → crossPending desc → effectiveNotBefore asc
  matchesWithPriority.sort((a, b) => {
    if (b.categoryDepth !== a.categoryDepth) return b.categoryDepth - a.categoryDepth
    if (b.crossPending !== a.crossPending) return b.crossPending - a.crossPending
    return a.effectiveNotBefore.getTime() - b.effectiveNotBefore.getTime()
  })

  // Initialize court slots from the incoming state (carries over from RR phase or dayStart).
  // If a court has already-completed matches, their end time may push the slot further out.
  const courtSlots: CourtSlot[] = initialCourtSlots.map((s) => ({ ...s }))

  // Distribute already-done matches across virtual court slots (round-robin)
  // to reflect their end times and avoid scheduling new matches too early.
  const doneMatches = allMatches
    .filter((m) => isDone(m.status) && m.scheduled_at)
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())

  for (let i = 0; i < doneMatches.length; i++) {
    const m = doneMatches[i]
    const slot = courtSlots[i % courtSlots.length]
    const scheduledMs = new Date(m.scheduled_at!).getTime()
    const br = bracketRoundByMatch.get(m.id) ?? null
    const scheduledDate = m.scheduled_at!.slice(0, 10)
    const dur = getMatchDuration(db, tournamentId, br, scheduledDate)
    const endMs = scheduledMs + dur * 60 * 1000
    if (endMs > slot.endTime) slot.endTime = endMs
  }

  // Slot-fill: always assign to the earliest-free court
  const remaining = [...matchesWithPriority]

  // Category affinity for early rounds (R32 and earlier):
  // once we start a category's block, keep scheduling it until exhausted.
  let activeCategory: string | null = null

  const sortByPriority = (
    a: (typeof remaining)[number],
    b: (typeof remaining)[number]
  ): number => {
    if (b.categoryDepth !== a.categoryDepth) return b.categoryDepth - a.categoryDepth
    if (b.crossPending !== a.crossPending) return b.crossPending - a.crossPending
    return a.effectiveNotBefore.getTime() - b.effectiveNotBefore.getTime()
  }

  while (remaining.length > 0) {
    courtSlots.sort((a, b) => a.endTime - b.endTime)
    const earliestSlot = courtSlots[0]
    const slotFreeAt = earliestSlot.endTime

    // Matches whose effective_not_before has already passed
    const available = remaining.filter(
      (item) => item.effectiveNotBefore.getTime() <= slotFreeAt
    )

    if (available.length === 0) {
      // Advance this court to the earliest match's not-before time
      courtSlots[0] = {
        ...courtSlots[0],
        endTime: Math.min(...remaining.map((item) => item.effectiveNotBefore.getTime()))
      }
      continue
    }

    // Pick next match:
    // For early rounds (R32 and earlier), apply category affinity:
    //   prefer matches of the current active category; switch only when it's exhausted.
    // For later rounds, use pure priority ordering.
    const earlyAvailable = available.filter((item) => item.isEarlyRound)
    let best: (typeof remaining)[number]

    if (earlyAvailable.length > 0) {
      if (activeCategory !== null) {
        const sameCat = earlyAvailable.filter((item) => item.category === activeCategory)
        if (sameCat.length > 0) {
          // Continue current category block
          best = [...sameCat].sort(sortByPriority)[0]
        } else {
          // Current category exhausted — switch to highest-priority early-round category
          const sorted = [...earlyAvailable].sort(sortByPriority)
          best = sorted[0]
          activeCategory = best.category
        }
      } else {
        // No active category yet — start with highest-priority early-round match
        const sorted = [...earlyAvailable].sort(sortByPriority)
        best = sorted[0]
        activeCategory = best.category
      }
    } else {
      // All early rounds done (or none exist) — use pure priority ordering
      activeCategory = null
      best = [...available].sort(sortByPriority)[0]
    }

    const scheduledDate = toLocalDateStr(new Date(slotFreeAt))
    const dur = getMatchDuration(db, tournamentId, best.bracketRound, scheduledDate)

    db.update(schema.matches)
      .set({
        scheduled_at: toLocalISO(new Date(slotFreeAt))
      })
      .where(eq(schema.matches.id, best.match.id))
      .run()

    courtSlots[0] = { ...courtSlots[0], endTime: slotFreeAt + dur * 60 * 1000 }

    remaining.splice(
      remaining.findIndex((item) => item.match.id === best.match.id),
      1
    )
  }

  return courtSlots
}

/**
 * Pre-schedule all non-READY playoff bracket matches across all rounds.
 *
 * Assigns preliminary scheduled_at and court_id to matches whose teams are not
 * yet known (future bracket rounds). Uses per-court slot-fill so courts freed
 * earlier by Phase 2 are used immediately. Respects bracket dependencies:
 * a match cannot start before its child matches end + rest_minutes, since the
 * winner needs time to recover before the next round.
 */
function _preScheduleBracket(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string,
  playoffRounds: Array<{ id: string }>,
  initialCourtSlots: CourtSlot[],
  restMinutes: number
): void {
  // Fresh query so we see Phase 2's scheduled_at assignments
  const allMatches = db
    .select()
    .from(schema.matches)
    .where(inArray(schema.matches.round_id, playoffRounds.map((r) => r.id)))
    .all()

  // Only matches without a slot yet (cleared by phase 0, not assigned by phase 2)
  const needsSchedule = allMatches.filter(
    (m) => !isDone(m.status) && m.scheduled_at === null
  )

  if (needsSchedule.length === 0) return

  // Compute bracket rounds for ordering and duration lookup
  const bracketRoundByMatch = new Map<string, number>()
  const maxBracketRoundByRound = new Map<string, number>()
  for (const round of playoffRounds) {
    const roundMatches = allMatches.filter((m) => m.round_id === round.id)
    const brs = computeBracketRoundsForRound(roundMatches)
    brs.forEach((br, mid) => bracketRoundByMatch.set(mid, br))
    if (brs.size > 0) maxBracketRoundByRound.set(round.id, Math.max(...brs.values()))
  }

  // Track start time (ms) for every match that has been scheduled, including
  // Phase 2 READY matches. Used to compute not_before for parent matches.
  const startMsById = new Map<string, number>()
  for (const m of allMatches) {
    if (m.scheduled_at) startMsById.set(m.id, new Date(m.scheduled_at).getTime())
  }

  const slots: CourtSlot[] = initialCourtSlots.map((s) => ({ ...s }))

  // Group by bracketRound and process level by level (ascending).
  // Within each level, compute notBeforeMs for all matches first, then sort
  // by notBeforeMs ASC so that categories whose players recovered earliest
  // run first. This naturally schedules XD R2 (players done at 13:30)
  // before MD R2 (players done at 15:00), even though they share bracketRound=2.
  const byBracketRound = new Map<number, typeof needsSchedule>()
  for (const m of needsSchedule) {
    const br = bracketRoundByMatch.get(m.id) ?? 1
    if (!byBracketRound.has(br)) byBracketRound.set(br, [])
    byBracketRound.get(br)!.push(m)
  }
  const sortedBracketRounds = [...byBracketRound.keys()].sort((a, b) => a - b)

  for (const bracketRound of sortedBracketRounds) {
    const matchesInRound = byBracketRound.get(bracketRound)!

    // Compute notBeforeMs, categoryDepth and isEarlyRound for every match in this level.
    // categoryDepth = maxBracketRound - codeBracketRound + 1  (depth=1 → final)
    // isEarlyRound  = maxBracketRound - codeBracketRound >= 4 (R32 and earlier)
    const enriched = matchesInRound.map((m) => {
      let notBeforeMs = 0
      for (const childId of [m.left_match_id, m.right_match_id]) {
        if (!childId) continue
        const childStartMs = startMsById.get(childId)
        if (childStartMs === undefined) continue
        const childBr = bracketRoundByMatch.get(childId) ?? null
        const childDate = toLocalDateStr(new Date(childStartMs))
        const childDur = getMatchDuration(db, tournamentId, childBr, childDate)
        notBeforeMs = Math.max(notBeforeMs, childStartMs + childDur * 60 * 1000 + restMinutes * 60 * 1000)
      }
      const codeBr = bracketRoundByMatch.get(m.id) ?? 1
      const maxBr = maxBracketRoundByRound.get(m.round_id) ?? 1
      const categoryDepth = maxBr - codeBr + 1
      const isEarlyRound = maxBr - codeBr >= 4
      return { match: m, notBeforeMs, categoryDepth, isEarlyRound }
    })

    // Build processing groups:
    //   • Early rounds (R32+): group by round_id so every category forms a contiguous
    //     block — no interleaving of MS/WS/XD matches at the same stage.
    //   • Late rounds (R16 and closer): each match is its own group — pure priority order.
    // Groups are then sorted: categoryDepth DESC → group's min notBeforeMs ASC.
    type MatchGroup = { categoryDepth: number; minNotBefore: number; items: typeof enriched }
    const groupMap = new Map<string, typeof enriched>()
    for (const item of enriched) {
      const key = item.isEarlyRound
        ? `${item.categoryDepth}:${item.match.round_id}`
        : `${item.categoryDepth}:${item.match.id}`
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key)!.push(item)
    }

    const matchGroups: MatchGroup[] = []
    for (const items of groupMap.values()) {
      items.sort((a, b) => a.notBeforeMs - b.notBeforeMs)
      matchGroups.push({
        categoryDepth: items[0].categoryDepth,
        minNotBefore: Math.min(...items.map((x) => x.notBeforeMs)),
        items
      })
    }
    matchGroups.sort((ga, gb) => {
      if (gb.categoryDepth !== ga.categoryDepth) return gb.categoryDepth - ga.categoryDepth
      return ga.minNotBefore - gb.minNotBefore
    })

    for (const group of matchGroups) {
    for (const { match: m, notBeforeMs } of group.items) {
      const br = bracketRoundByMatch.get(m.id) ?? null

      // Pick the court that gives the earliest actual start time:
      // actual_start = max(court.endTime, notBeforeMs)
      slots.sort((a, b) => {
        const startA = Math.max(a.endTime, notBeforeMs)
        const startB = Math.max(b.endTime, notBeforeMs)
        if (startA !== startB) return startA - startB
        return a.endTime - b.endTime
      })

      const chosenSlot = slots[0]
      const startTime = Math.max(chosenSlot.endTime, notBeforeMs)
      const scheduledDate = toLocalDateStr(new Date(startTime))
      const duration = getMatchDuration(db, tournamentId, br, scheduledDate)

      db.update(schema.matches)
        .set({
          scheduled_at: toLocalISO(new Date(startTime))
        })
        .where(eq(schema.matches.id, m.id))
        .run()

      slots[0] = { ...chosenSlot, endTime: startTime + duration * 60 * 1000 }
      startMsById.set(m.id, startTime)
    } // end group.items loop
    } // end matchGroups loop
  } // end bracketRound loop
}

/**
 * Set or clear the not_before_hard constraint for a match.
 * After setting, recompute effective_not_before (stored as not_before_soft stays unchanged).
 */
export function setNotBeforeHard(
  db: BetterSQLite3Database<typeof schema>,
  matchId: string,
  datetime: string | null
): void {
  db.update(schema.matches)
    .set({ not_before_hard: datetime })
    .where(eq(schema.matches.id, matchId))
    .run()
}

/**
 * Build the scheduling queue for a tournament:
 * all READY unscheduled playoff matches sorted by priority desc.
 * Returns enriched match data for display.
 */
export function buildQueue(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string
): Array<{
  matchId: string
  priority: number
  categoryDepth: number
  crossPending: number
  effectiveNotBefore: string
  notBeforeSoft: string | null
  notBeforeHard: string | null
}> {
  const allEvents = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()

  if (allEvents.length === 0) return []

  const allRounds = db
    .select()
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, allEvents.map((e) => e.id)))
    .all()

  const playoffRounds = allRounds.filter((r) => r.type === 'playoff')
  if (playoffRounds.length === 0) return []

  const allMatches = db
    .select()
    .from(schema.matches)
    .where(inArray(schema.matches.round_id, playoffRounds.map((r) => r.id)))
    .all()

  const bracketRoundByMatch = new Map<string, number>()
  const maxBracketRoundByRound = new Map<string, number>()
  for (const round of playoffRounds) {
    const roundMatches = allMatches.filter((m) => m.round_id === round.id)
    const bracketRounds = computeBracketRoundsForRound(roundMatches)
    bracketRounds.forEach((br, mid) => bracketRoundByMatch.set(mid, br))
    if (bracketRounds.size > 0) {
      maxBracketRoundByRound.set(round.id, Math.max(...bracketRounds.values()))
    }
  }

  const eventByRound = new Map(allRounds.map((r) => [r.id, r.event_id]))
  const tournament = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, tournamentId))
    .get()

  const defaultDate = tournament?.date_start ?? toLocalDateStr(new Date())

  const readyUnscheduled = allMatches.filter((m) => {
    return m.status === 'ready' && !m.scheduled_at
  })

  const result = readyUnscheduled.map((m) => {
    const bracketRound = bracketRoundByMatch.get(m.id) ?? 1
    const maxBracketRound = maxBracketRoundByRound.get(m.round_id) ?? 1
    const categoryDepth = computeCategoryDepth(bracketRound, maxBracketRound)
    const eventId = eventByRound.get(m.round_id) ?? ''

    const playerIds = getPlayerIdsForMatch(db, m.team1_id, m.team2_id)
    const crossPending =
      playerIds.length > 0
        ? Math.max(...playerIds.map((pid) => computeCrossPending(db, pid, eventId, tournamentId)))
        : 0

    const priority = categoryDepth + crossPending
    const dayStart = getDayStart(db, tournamentId, defaultDate)
    const effective = computeEffectiveNotBefore(m.not_before_soft, m.not_before_hard, dayStart)

    return {
      matchId: m.id,
      priority,
      categoryDepth,
      crossPending,
      effectiveNotBefore: toLocalISO(effective),
      notBeforeSoft: m.not_before_soft,
      notBeforeHard: m.not_before_hard
    }
  })

  result.sort((a, b) => {
    if (b.categoryDepth !== a.categoryDepth) return b.categoryDepth - a.categoryDepth
    if (b.crossPending !== a.crossPending) return b.crossPending - a.crossPending
    return new Date(a.effectiveNotBefore).getTime() - new Date(b.effectiveNotBefore).getTime()
  })

  return result
}
