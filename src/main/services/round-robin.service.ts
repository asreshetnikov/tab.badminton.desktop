import { eq } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../db/schema'
import type { MatchWithTeams } from '@shared/types/match'

/**
 * Berger circle-method schedule for round-robin tournaments.
 *
 * Each team appears at most once per tour.
 * For odd n, a "bye" is added so every team sits out exactly one tour.
 *
 * Returns pairs sorted by tour, then by insertion order within tour.
 */
export function bergerSchedule(
  teamIds: string[]
): Array<{ team1_id: string; team2_id: string; tour: number }> {
  const n = teamIds.length
  if (n < 2) return []

  // For odd n add a bye slot (null) to make the count even
  const slots: (string | null)[] = n % 2 === 0 ? [...teamIds] : [...teamIds, null]
  const m = slots.length // even

  const fixed = slots[m - 1]
  const rotating = slots.slice(0, m - 1)

  const result: Array<{ team1_id: string; team2_id: string; tour: number }> = []

  for (let r = 0; r < m - 1; r++) {
    const tour = r + 1

    // Rotate: position i in this round holds rotating[(i + r) % (m-1)]
    const circle: (string | null)[] = rotating.map((_, i) => rotating[(i + r) % (m - 1)])

    // Layout: top row = [fixed, circle[0..m/2-2]], bottom row = [circle[m/2-1..m-2]] reversed
    const top: (string | null)[] = [fixed, ...circle.slice(0, m / 2 - 1)]
    const bottom: (string | null)[] = circle.slice(m / 2 - 1).reverse()

    for (let i = 0; i < m / 2; i++) {
      const a = top[i]
      const b = bottom[i]
      if (a !== null && b !== null) {
        result.push({ team1_id: a, team2_id: b, tour })
      }
    }
  }

  return result
}

/**
 * Generate round-robin matches for a round using the Berger schedule.
 * Throws if matches already exist for the round.
 */
export function generateMatches(
  db: BetterSQLite3Database<typeof schema>,
  roundId: string
): MatchWithTeams[] {
  const existing = db
    .select({ id: schema.matches.id })
    .from(schema.matches)
    .where(eq(schema.matches.round_id, roundId))
    .all()

  if (existing.length > 0) {
    throw new Error(`Matches already generated for round ${roundId}`)
  }

  const roundTeams = db
    .select({ team_id: schema.round_teams.team_id })
    .from(schema.round_teams)
    .where(eq(schema.round_teams.round_id, roundId))
    .all()

  const pairs = bergerSchedule(roundTeams.map((rt) => rt.team_id))

  const created: MatchWithTeams[] = []
  for (const pair of pairs) {
    const id = randomUUID()
    db.insert(schema.matches)
      .values({
        id,
        round_id: roundId,
        team1_id: pair.team1_id,
        team2_id: pair.team2_id,
        tour: pair.tour
      })
      .run()
    created.push(getMatchWithTeams(db, id))
  }

  return created
}

export function getMatchWithTeams(
  db: BetterSQLite3Database<typeof schema>,
  matchId: string
): MatchWithTeams {
  const match = db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, matchId))
    .get()

  if (!match) throw new Error(`Match not found: ${matchId}`)

  const team1 = match.team1_id
    ? db.select().from(schema.teams).where(eq(schema.teams.id, match.team1_id)).get() ?? null
    : null
  const team2 = match.team2_id
    ? db.select().from(schema.teams).where(eq(schema.teams.id, match.team2_id)).get() ?? null
    : null

  return {
    ...match,
    team1: team1 ? { id: team1.id, name: team1.name } : null,
    team2: team2 ? { id: team2.id, name: team2.name } : null
  }
}
