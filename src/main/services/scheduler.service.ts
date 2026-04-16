/**
 * Playoff Scheduler Service
 *
 * Implements the priority-based scheduling algorithm for single-elimination brackets.
 *
 * Priority formula:
 *   priority(match) = category_depth + max(cross_pending)
 *
 * where:
 *   category_depth = rounds remaining until final (final=1, semi=2, quarter=3, ...)
 *   cross_pending  = count of unfinished matches this player has in OTHER events
 *
 * not_before_soft(match) = max over all players: last_end(player) + rest_minutes
 * effective_not_before   = max(not_before_soft, not_before_hard)
 */

import { eq, inArray, and, notInArray } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'

const DEFAULT_START_TIME = '09:00'
const DEFAULT_MATCH_DURATION = 60

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
 * Falls back to day setting or DEFAULT_MATCH_DURATION.
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
  return daySetting?.match_duration ?? DEFAULT_MATCH_DURATION
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

  // Determine the tournament start date for fallback
  const tournament = db
    .select({ date_start: schema.tournaments.date_start })
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, tournamentId))
    .get()

  const defaultDate = tournament?.date_start ?? new Date().toISOString().slice(0, 10)

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
        const duration = DEFAULT_MATCH_DURATION * 60 * 1000
        const estimatedEnd = scheduledMs + duration
        if (lastEndMs === null || estimatedEnd > lastEndMs) lastEndMs = estimatedEnd
      }
    }

    // If no prior matches, use day start as base
    if (lastEndMs === null) {
      lastEndMs = getDayStart(db, tournamentId, defaultDate).getTime()
    }

    const notBeforeMs = lastEndMs + restMinutes * 60 * 1000
    if (maxNotBefore === null || notBeforeMs > maxNotBefore) maxNotBefore = notBeforeMs
  }

  if (maxNotBefore === null) return null
  return new Date(maxNotBefore).toISOString()
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
  const now = new Date().toISOString()

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
      if (isDone(m.status)) return false
      if (!m.team1_id || !m.team2_id) return false // not ready yet
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
 * Full auto-schedule: assigns all unscheduled READY playoff matches to courts.
 * Preserves existing manual assignments (matches with scheduled_at are not touched).
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

  const restMinutes = tournament.rest_minutes ?? 30
  const defaultDate = tournament.date_start

  _runScheduler(db, tournamentId, courts, restMinutes, defaultDate, true)
}

/**
 * Core scheduling loop.
 *
 * @param recomputeSoft - if true, recompute not_before_soft for all matches before scheduling
 */
function _runScheduler(
  db: BetterSQLite3Database<typeof schema>,
  tournamentId: string,
  courts: Array<{ id: string; name: string }>,
  restMinutes: number,
  defaultDate: string,
  recomputeSoft: boolean
): void {
  // Gather all playoff rounds for this tournament
  const allEvents = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.tournament_id, tournamentId))
    .all()

  if (allEvents.length === 0) return

  const allRounds = db
    .select()
    .from(schema.rounds)
    .where(inArray(schema.rounds.event_id, allEvents.map((e) => e.id)))
    .all()

  const playoffRounds = allRounds.filter((r) => r.type === 'playoff')
  if (playoffRounds.length === 0) return

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

  // Build event lookup: round_id → event_id
  const eventByRound = new Map(allRounds.map((r) => [r.id, r.event_id]))

  // Find READY unscheduled matches (both teams known, not finished, no scheduled_at)
  const readyUnscheduled = allMatches.filter((m) => {
    if (!m.team1_id || !m.team2_id) return false
    if (isDone(m.status)) return false
    if (m.scheduled_at !== null) return false
    return true
  })

  if (readyUnscheduled.length === 0) return

  // Optionally recompute not_before_soft for all ready matches
  if (recomputeSoft) {
    for (const m of readyUnscheduled) {
      const notBeforeSoft = computeNotBeforeSoft(
        db, m.id, m.team1_id, m.team2_id, tournamentId, restMinutes
      )
      db.update(schema.matches)
        .set({ not_before_soft: notBeforeSoft })
        .where(eq(schema.matches.id, m.id))
        .run()
      m.not_before_soft = notBeforeSoft
    }
  }

  // Compute priority for each match
  const matchesWithPriority = readyUnscheduled.map((m) => {
    const bracketRound = bracketRoundByMatch.get(m.id) ?? 1
    const maxBracketRound = maxBracketRoundByRound.get(m.round_id) ?? 1
    const categoryDepth = computeCategoryDepth(bracketRound, maxBracketRound)
    const eventId = eventByRound.get(m.round_id) ?? ''

    const playerIds = getPlayerIdsForMatch(db, m.team1_id, m.team2_id)
    const crossPending = playerIds.length > 0
      ? Math.max(...playerIds.map((pid) => computeCrossPending(db, pid, eventId, tournamentId)))
      : 0

    const priority = categoryDepth + crossPending

    const dayStart = getDayStart(db, tournamentId, defaultDate)
    const effectiveNotBefore = computeEffectiveNotBefore(
      m.not_before_soft, m.not_before_hard, dayStart
    )

    return { match: m, priority, effectiveNotBefore, bracketRound }
  })

  // Sort: priority desc, then effectiveNotBefore asc
  matchesWithPriority.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return a.effectiveNotBefore.getTime() - b.effectiveNotBefore.getTime()
  })

  // Initialize court free-at times from existing scheduled matches
  const courtFreeAt = new Map<string, number>()
  for (const court of courts) {
    // Find the latest estimated end time for this court
    const courtMatches = allMatches.filter((m) => m.court_id === court.id && m.scheduled_at)
    let freeAt = getDayStart(db, tournamentId, defaultDate).getTime()

    for (const m of courtMatches) {
      if (!m.scheduled_at) continue
      const scheduledMs = new Date(m.scheduled_at).getTime()
      const br = bracketRoundByMatch.get(m.id) ?? null
      const scheduledDate = m.scheduled_at.slice(0, 10)
      const dur = getMatchDuration(db, tournamentId, br, scheduledDate)
      const estimatedEnd = scheduledMs + dur * 60 * 1000
      if (estimatedEnd > freeAt) freeAt = estimatedEnd
    }
    courtFreeAt.set(court.id, freeAt)
  }

  // Greedily assign each match to the best court
  for (const { match, effectiveNotBefore, bracketRound } of matchesWithPriority) {
    // Find the court with earliest possible start for this match
    let bestCourtId: string | null = null
    let bestStart: number | null = null

    for (const court of courts) {
      const courtFree = courtFreeAt.get(court.id) ?? 0
      const start = Math.max(courtFree, effectiveNotBefore.getTime())
      if (bestStart === null || start < bestStart) {
        bestStart = start
        bestCourtId = court.id
      }
    }

    if (!bestCourtId || bestStart === null) continue

    const scheduledDate = new Date(bestStart).toISOString().slice(0, 10)
    const dur = getMatchDuration(db, tournamentId, bracketRound, scheduledDate)
    const scheduledAt = new Date(bestStart).toISOString()

    db.update(schema.matches)
      .set({ scheduled_at: scheduledAt, court_id: bestCourtId })
      .where(eq(schema.matches.id, match.id))
      .run()

    // Update court free-at
    courtFreeAt.set(bestCourtId, bestStart + dur * 60 * 1000)
  }
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

  const defaultDate = tournament?.date_start ?? new Date().toISOString().slice(0, 10)

  const readyUnscheduled = allMatches.filter((m) => {
    return m.team1_id && m.team2_id && !isDone(m.status) && !m.scheduled_at
  })

  const result = readyUnscheduled.map((m) => {
    const bracketRound = bracketRoundByMatch.get(m.id) ?? 1
    const maxBracketRound = maxBracketRoundByRound.get(m.round_id) ?? 1
    const categoryDepth = computeCategoryDepth(bracketRound, maxBracketRound)
    const eventId = eventByRound.get(m.round_id) ?? ''

    const playerIds = getPlayerIdsForMatch(db, m.team1_id, m.team2_id)
    const crossPending = playerIds.length > 0
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
      effectiveNotBefore: effective.toISOString(),
      notBeforeSoft: m.not_before_soft,
      notBeforeHard: m.not_before_hard
    }
  })

  result.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return new Date(a.effectiveNotBefore).getTime() - new Date(b.effectiveNotBefore).getTime()
  })

  return result
}
