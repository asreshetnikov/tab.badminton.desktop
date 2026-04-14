import { eq, asc } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../db/schema'
import type { MatchWithTeams } from '@shared/types/match'
import { getMatchWithTeams } from './round-robin.service'

/**
 * Returns the smallest power of 2 that is >= n.
 */
export function nextPowerOf2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

/**
 * Returns the seeding slot order for a single-elimination bracket of size n
 * (n must be a power of 2).
 *
 * Guarantees that:
 * - Seed 1 occupies slot 0
 * - Seeds 1 and 2 land in opposite halves
 * - Each adjacent pair sums to n+1  (e.g. n=8: pairs are 1+8, 4+5, 2+7, 3+6)
 *
 * Example: n=8 → [1, 8, 4, 5, 2, 7, 3, 6]
 */
export function buildSeedingOrder(n: number): number[] {
  if (n === 2) return [1, 2]
  const half = buildSeedingOrder(n / 2)
  const result: number[] = []
  for (const s of half) {
    result.push(s)
    result.push(n + 1 - s)
  }
  return result
}

/**
 * Generate a single-elimination playoff bracket for a round.
 *
 * Teams in round_teams are sorted by seed (NULLs come last in SQLite ASC order).
 * The bracket size is the next power of 2 >= team count.
 * Bye slots go to the positions with the highest seed numbers (lowest-ranked teams
 * face byes in standard tournament seeding — actually, top-seeded teams get byes).
 *
 * Wait — standard practice: byes go to TOP seeds (seeds 1..byes get byes).
 * Here seeding positions > n are byes; top seeds occupy the lowest slot numbers,
 * so by the seeding order seeds 1 through `byes` will face a bye slot and
 * auto-advance with status='walkover'.
 *
 * Returns all created matches ordered first-round → final.
 */
export function generateBracket(
  db: BetterSQLite3Database<typeof schema>,
  roundId: string
): MatchWithTeams[] {
  const existing = db
    .select({ id: schema.matches.id })
    .from(schema.matches)
    .where(eq(schema.matches.round_id, roundId))
    .all()

  if (existing.length > 0) {
    throw new Error(`Matches already exist for round ${roundId}`)
  }

  const roundTeams = db
    .select()
    .from(schema.round_teams)
    .where(eq(schema.round_teams.round_id, roundId))
    .orderBy(asc(schema.round_teams.seed))
    .all()

  const n = roundTeams.length
  if (n < 2) throw new Error('Need at least 2 teams to generate playoff bracket')

  const size = nextPowerOf2(n)
  const numRounds = Math.log2(size) // e.g. 8 → 3
  const seedingOrder = buildSeedingOrder(size)

  // Pre-generate all match IDs organised by level.
  // levels[0] = first round  (size/2 matches)
  // levels[numRounds-1] = final (1 match)
  const levels: string[][] = []
  for (let r = 0; r < numRounds; r++) {
    const count = size / Math.pow(2, r + 1)
    levels.push(Array.from({ length: count }, () => randomUUID()))
  }

  // Phase 1: Insert all match rows with bracket links but no teams yet.
  // Insert from final down to first round so parent rows exist when byes are propagated.
  for (let r = numRounds - 1; r >= 0; r--) {
    for (let i = 0; i < levels[r].length; i++) {
      const matchId = levels[r][i]
      const winMatchId = r < numRounds - 1 ? levels[r + 1][Math.floor(i / 2)] : null
      const leftMatchId = r > 0 ? levels[r - 1][i * 2] : null
      const rightMatchId = r > 0 ? levels[r - 1][i * 2 + 1] : null

      db.insert(schema.matches)
        .values({
          id: matchId,
          round_id: roundId,
          status: 'scheduled',
          win_match_id: winMatchId,
          left_match_id: leftMatchId,
          right_match_id: rightMatchId
        })
        .run()
    }
  }

  // Phase 2: Assign teams to first-round matches and propagate byes upward.
  for (let i = 0; i < levels[0].length; i++) {
    const matchId = levels[0][i]
    const slot1 = seedingOrder[i * 2]     // seed number for team1 slot
    const slot2 = seedingOrder[i * 2 + 1] // seed number for team2 slot

    // Seeds above n are bye slots — no team is assigned there
    const team1Id = slot1 <= n ? roundTeams[slot1 - 1].team_id : null
    const team2Id = slot2 <= n ? roundTeams[slot2 - 1].team_id : null

    let winnerId: string | null = null
    let status: 'scheduled' | 'walkover' = 'scheduled'

    if (team1Id && !team2Id) {
      winnerId = team1Id
      status = 'walkover'
    } else if (!team1Id && team2Id) {
      winnerId = team2Id
      status = 'walkover'
    }

    db.update(schema.matches)
      .set({ team1_id: team1Id, team2_id: team2Id, winner_team_id: winnerId, status })
      .where(eq(schema.matches.id, matchId))
      .run()

    // Propagate the bye winner into the correct team slot of the parent match
    if (winnerId && levels[1]) {
      const parentId = levels[1][Math.floor(i / 2)]
      const isLeftSlot = i % 2 === 0
      db.update(schema.matches)
        .set(isLeftSlot ? { team1_id: winnerId } : { team2_id: winnerId })
        .where(eq(schema.matches.id, parentId))
        .run()
    }
  }

  // Return all matches in order: first round → final
  return levels.flat().map((id) => getMatchWithTeams(db, id))
}

/**
 * After a playoff match result is entered, advance the winner into the correct
 * slot of the next match in the bracket.
 *
 * - If this match is the `left_match_id` of its parent → fills `team1_id`.
 * - If this match is the `right_match_id` of its parent → fills `team2_id`.
 * - If the match has no `win_match_id` (it is the final) → no-op.
 * - If the match has no winner yet → no-op.
 */
export function advanceWinner(
  db: BetterSQLite3Database<typeof schema>,
  matchId: string
): void {
  const match = db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, matchId))
    .get()

  if (!match) throw new Error(`Match not found: ${matchId}`)
  if (!match.winner_team_id) return // no winner — nothing to advance
  if (!match.win_match_id) return   // final — no next match

  const parent = db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, match.win_match_id))
    .get()

  if (!parent) throw new Error(`Parent match not found: ${match.win_match_id}`)

  const isLeftChild = parent.left_match_id === matchId
  db
    .update(schema.matches)
    .set(isLeftChild ? { team1_id: match.winner_team_id } : { team2_id: match.winner_team_id })
    .where(eq(schema.matches.id, parent.id))
    .run()
}
