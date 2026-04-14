import { eq, isNotNull, inArray } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'

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
