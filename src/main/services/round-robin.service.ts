import { eq, and, inArray } from 'drizzle-orm'
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
        status: 'ready',
        team1_id: pair.team1_id,
        team2_id: pair.team2_id,
        tour: pair.tour
      })
      .run()
    created.push(getMatchWithTeams(db, id))
  }

  return created
}

/**
 * Recalculate round_table standings for a round based on finished/walkover/retired matches.
 * Resets all rows to zero, then accumulates wins, losses, sets and points from decided matches.
 * Updates position field after sorting.
 */
export function updateStandings(
  db: BetterSQLite3Database<typeof schema>,
  roundId: string
): void {
  // Reset all rows
  db.update(schema.round_table)
    .set({ wins: 0, losses: 0, sets_won: 0, sets_lost: 0, points_won: 0, points_lost: 0, position: null })
    .where(eq(schema.round_table.round_id, roundId))
    .run()

  // Fetch all decided matches
  const decidedMatches = db
    .select()
    .from(schema.matches)
    .where(
      and(
        eq(schema.matches.round_id, roundId),
        inArray(schema.matches.status, ['finished', 'walkover', 'retired'])
      )
    )
    .all()

  type Stats = { wins: number; losses: number; sets_won: number; sets_lost: number; points_won: number; points_lost: number }
  const acc: Record<string, Stats> = {}

  function ensure(teamId: string) {
    if (!acc[teamId]) acc[teamId] = { wins: 0, losses: 0, sets_won: 0, sets_lost: 0, points_won: 0, points_lost: 0 }
  }

  for (const match of decidedMatches) {
    const t1 = match.team1_id
    const t2 = match.team2_id
    if (!t1 || !t2) continue

    ensure(t1)
    ensure(t2)

    if (match.winner_team_id === t1) {
      acc[t1].wins++
      acc[t2].losses++
    } else if (match.winner_team_id === t2) {
      acc[t2].wins++
      acc[t1].losses++
    }

    const s1 = match.s1 ?? 0
    const s2 = match.s2 ?? 0
    acc[t1].sets_won += s1
    acc[t1].sets_lost += s2
    acc[t2].sets_won += s2
    acc[t2].sets_lost += s1

    const sets = db
      .select()
      .from(schema.match_sets)
      .where(eq(schema.match_sets.match_id, match.id))
      .all()
    for (const set of sets) {
      acc[t1].points_won += set.s1
      acc[t1].points_lost += set.s2
      acc[t2].points_won += set.s2
      acc[t2].points_lost += set.s1
    }
  }

  for (const [teamId, stats] of Object.entries(acc)) {
    db.update(schema.round_table)
      .set(stats)
      .where(and(eq(schema.round_table.round_id, roundId), eq(schema.round_table.team_id, teamId)))
      .run()
  }

  // Assign positions
  const rows = db
    .select()
    .from(schema.round_table)
    .where(eq(schema.round_table.round_id, roundId))
    .all()

  rows
    .slice()
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      const sdDiff = (b.sets_won - b.sets_lost) - (a.sets_won - a.sets_lost)
      if (sdDiff !== 0) return sdDiff
      return (b.points_won - b.points_lost) - (a.points_won - a.points_lost)
    })
    .forEach((row, i) => {
      db.update(schema.round_table)
        .set({ position: i + 1 })
        .where(eq(schema.round_table.id, row.id))
        .run()
    })
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

  const sets = db
    .select()
    .from(schema.match_sets)
    .where(eq(schema.match_sets.match_id, match.id))
    .all()

  const team1Seed = match.team1_id ? getRoundTeamSeed(db, match.round_id, match.team1_id) : emptySeed()
  const team2Seed = match.team2_id ? getRoundTeamSeed(db, match.round_id, match.team2_id) : emptySeed()

  return {
    ...match,
    team1: team1 ? { id: team1.id, name: team1.name, ...team1Seed } : null,
    team2: team2 ? { id: team2.id, name: team2.name, ...team2Seed } : null,
    sets
  }
}

function getRoundTeamSeed(
  db: BetterSQLite3Database<typeof schema>,
  roundId: string,
  teamId: string
) {
  const row = db
    .select({
      seed: schema.round_teams.seed,
      seed_lo: schema.tournament_teams.seed_lo,
      seed_hi: schema.tournament_teams.seed_hi
    })
    .from(schema.round_teams)
    .innerJoin(schema.rounds, eq(schema.round_teams.round_id, schema.rounds.id))
    .leftJoin(
      schema.tournament_teams,
      and(
        eq(schema.tournament_teams.event_id, schema.rounds.event_id),
        eq(schema.tournament_teams.team_id, schema.round_teams.team_id)
      )
    )
    .where(and(eq(schema.round_teams.round_id, roundId), eq(schema.round_teams.team_id, teamId)))
    .get()
  return row ?? emptySeed()
}

function emptySeed(): { seed: number | null; seed_lo: number | null; seed_hi: number | null } {
  return { seed: null, seed_lo: null, seed_hi: null }
}
