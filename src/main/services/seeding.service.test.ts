/**
 * Tests for the seeding feature (TDD — written before implementation).
 *
 * Covers:
 *   1. validateSeedNotation   — pure validation of lo/hi group notation
 *   2. buildDrawPlan          — pure function: resolves group/unseeded entries to concrete seeds
 *   3. resolveDraw (DB)       — writes resolved seeds; blocks if matches already exist
 *   4. generateBracket guard  — throws if any round_team has seed = null (not yet resolved)
 *   5. Bracket placement      — after resolveDraw + generateBracket, seeding guarantees hold
 *
 * Declared seeds (seed_lo / seed_hi) are stored on tournament_teams (category level).
 * resolveDraw reads declared seeds via tournament_teams JOIN and writes resolved seeds
 * (the concrete integer position) into round_teams.seed.
 */

import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { createTestDb } from '../db/test-helpers'
import {
  validateSeedNotation,
  buildDrawPlan,
  resolveDraw,
} from './seeding.service'
import { generateBracket } from './playoff.service'
import { TournamentRepository } from '../db/repositories/tournament.repo'
import { EventRepository } from '../db/repositories/event.repo'
import { PlayerRepository } from '../db/repositories/player.repo'
import { TeamRepository } from '../db/repositories/team.repo'
import { RoundRepository } from '../db/repositories/round.repo'
import { RoundTeamRepository } from '../db/repositories/round-team.repo'
import * as schema from '../db/schema'

// ─── Shared setup ─────────────────────────────────────────────────────────────

function setupRound() {
  const db = createTestDb()
  const tournamentId = new TournamentRepository(db).create({
    name: 'Seed Test Cup',
    date_start: '2026-06-01',
    date_end: '2026-06-01',
  }).id
  const eventId = new EventRepository(db).create({
    tournament_id: tournamentId,
    name: "Men's Singles",
    category: 'MS',
  }).id
  const roundId = new RoundRepository(db).create({
    event_id: eventId,
    name: 'Playoff',
    type: 'playoff',
  }).id
  const roundTeamRepo = new RoundTeamRepository(db)

  /**
   * Add a team to the round and return the roundTeamId.
   * seedLo / seedHi represent the *declared* seed (null = unseeded).
   * Declared seeds are stored in tournament_teams (category level).
   * The resolved integer `seed` in round_teams starts as null until resolveDraw is called.
   */
  function addEntry(
    name: string,
    seedLo: number | null = null,
    seedHi: number | null = null
  ): { teamId: string; roundTeamId: string } {
    const playerId = new PlayerRepository(db).create({
      first_name: 'P',
      last_name: name,
    }).id
    const teamId = new TeamRepository(db).create({
      name,
      category: 'MS',
      player_ids: [playerId],
    }).id

    // Register in the category (tournament_teams) and set the declared seed there
    db.insert(schema.tournament_teams)
      .values({ id: randomUUID(), tournament_id: tournamentId, event_id: eventId, team_id: teamId, seed_lo: seedLo, seed_hi: seedHi })
      .run()

    const rt = roundTeamRepo.add(roundId, teamId)
    return { teamId, roundTeamId: rt.id }
  }

  return { db, roundId, addEntry }
}

// ─── 1. validateSeedNotation ──────────────────────────────────────────────────

describe('validateSeedNotation', () => {
  it('exact seed 1 is valid', () => {
    expect(validateSeedNotation(1, null)).toBeNull()
  })

  it('exact seed 16 is valid', () => {
    expect(validateSeedNotation(16, null)).toBeNull()
  })

  it('group 1/2 is valid', () => {
    expect(validateSeedNotation(1, 2)).toBeNull()
  })

  it('group 3/4 is valid', () => {
    expect(validateSeedNotation(3, 4)).toBeNull()
  })

  it('group 5/8 is valid', () => {
    expect(validateSeedNotation(5, 8)).toBeNull()
  })

  it('group 9/16 is valid', () => {
    expect(validateSeedNotation(9, 16)).toBeNull()
  })

  it('group 17/32 is valid', () => {
    expect(validateSeedNotation(17, 32)).toBeNull()
  })

  it('hi must be a power of 2 — 3/6 is invalid', () => {
    expect(validateSeedNotation(3, 6)).not.toBeNull()
  })

  it('hi must be a power of 2 — 1/3 is invalid', () => {
    expect(validateSeedNotation(1, 3)).not.toBeNull()
  })

  it('lo must equal hi/2 + 1 — 4/8 is invalid (should be 5/8)', () => {
    expect(validateSeedNotation(4, 8)).not.toBeNull()
  })

  it('lo must equal hi/2 + 1 — 2/4 is invalid (should be 3/4)', () => {
    expect(validateSeedNotation(2, 4)).not.toBeNull()
  })

  it('lo > 0 required — 0/2 is invalid', () => {
    expect(validateSeedNotation(0, 2)).not.toBeNull()
  })

  it('lo must be less than hi — 4/4 is invalid', () => {
    expect(validateSeedNotation(4, 4)).not.toBeNull()
  })

  it('lo must be positive — negative lo is invalid', () => {
    expect(validateSeedNotation(-1, null)).not.toBeNull()
  })
})

// ─── 2. buildDrawPlan ─────────────────────────────────────────────────────────

/**
 * buildDrawPlan(entries) → array of { id, seed }
 *
 * entries: { id: string; seedLo: number|null; seedHi: number|null }[]
 */

type DrawEntry = { id: string; seedLo: number | null; seedHi: number | null }

describe('buildDrawPlan — unseeded entries', () => {
  it('n=1 unseeded → seed 1', () => {
    const entries: DrawEntry[] = [{ id: 'a', seedLo: null, seedHi: null }]
    const result = buildDrawPlan(entries)
    expect(result).toHaveLength(1)
    expect(result[0].seed).toBe(1)
  })

  it('n=4 unseeded → each gets a unique seed from 1 to 4', () => {
    const entries: DrawEntry[] = [
      { id: 'a', seedLo: null, seedHi: null },
      { id: 'b', seedLo: null, seedHi: null },
      { id: 'c', seedLo: null, seedHi: null },
      { id: 'd', seedLo: null, seedHi: null },
    ]
    const result = buildDrawPlan(entries)
    const seeds = result.map((r) => r.seed).sort((a, b) => a - b)
    expect(seeds).toEqual([1, 2, 3, 4])
  })

  it('n=4 unseeded — output contains all input ids', () => {
    const entries: DrawEntry[] = [
      { id: 'a', seedLo: null, seedHi: null },
      { id: 'b', seedLo: null, seedHi: null },
      { id: 'c', seedLo: null, seedHi: null },
      { id: 'd', seedLo: null, seedHi: null },
    ]
    const result = buildDrawPlan(entries)
    const ids = result.map((r) => r.id).sort()
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
  })

  it('n=4 unseeded — produces different orderings across multiple runs', () => {
    const entries: DrawEntry[] = [
      { id: 'a', seedLo: null, seedHi: null },
      { id: 'b', seedLo: null, seedHi: null },
      { id: 'c', seedLo: null, seedHi: null },
      { id: 'd', seedLo: null, seedHi: null },
    ]
    const signatures = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const result = buildDrawPlan(entries)
      signatures.add(result.map((r) => r.id).join(','))
    }
    // With 4 entries (24 permutations) and 100 runs, we expect more than 1 unique ordering
    expect(signatures.size).toBeGreaterThan(1)
  })
})

describe('buildDrawPlan — exact seeds', () => {
  it('exact seeds are preserved as-is', () => {
    const entries: DrawEntry[] = [
      { id: 'a', seedLo: 1, seedHi: null },
      { id: 'b', seedLo: 2, seedHi: null },
    ]
    const result = buildDrawPlan(entries)
    expect(result.find((r) => r.id === 'a')!.seed).toBe(1)
    expect(result.find((r) => r.id === 'b')!.seed).toBe(2)
  })

  it('exact seeds plus unseeded — unseeded fills remaining slots', () => {
    const entries: DrawEntry[] = [
      { id: 'a', seedLo: 1, seedHi: null },
      { id: 'b', seedLo: 2, seedHi: null },
      { id: 'c', seedLo: null, seedHi: null },
      { id: 'd', seedLo: null, seedHi: null },
    ]
    const result = buildDrawPlan(entries)
    expect(result.find((r) => r.id === 'a')!.seed).toBe(1)
    expect(result.find((r) => r.id === 'b')!.seed).toBe(2)
    const unseededSeeds = result
      .filter((r) => r.id === 'c' || r.id === 'd')
      .map((r) => r.seed)
      .sort((a, b) => a - b)
    expect(unseededSeeds).toEqual([3, 4])
  })
})

describe('buildDrawPlan — group seeds', () => {
  it('group 1/2 with 2 entries → both get distinct seeds from {1,2}', () => {
    const entries: DrawEntry[] = [
      { id: 'a', seedLo: 1, seedHi: 2 },
      { id: 'b', seedLo: 1, seedHi: 2 },
    ]
    const result = buildDrawPlan(entries)
    const seeds = result.map((r) => r.seed).sort((a, b) => a - b)
    expect(seeds).toEqual([1, 2])
  })

  it('group 3/4 with 2 entries → both get distinct seeds from {3,4}', () => {
    const entries: DrawEntry[] = [
      { id: 'a', seedLo: 3, seedHi: 4 },
      { id: 'b', seedLo: 3, seedHi: 4 },
    ]
    const result = buildDrawPlan(entries)
    const seeds = result.map((r) => r.seed).sort((a, b) => a - b)
    expect(seeds).toEqual([3, 4])
  })

  it('group 5/8 with 4 entries → all get distinct seeds from {5,6,7,8}', () => {
    const entries: DrawEntry[] = [
      { id: 'a', seedLo: 5, seedHi: 8 },
      { id: 'b', seedLo: 5, seedHi: 8 },
      { id: 'c', seedLo: 5, seedHi: 8 },
      { id: 'd', seedLo: 5, seedHi: 8 },
    ]
    const result = buildDrawPlan(entries)
    const seeds = result.map((r) => r.seed).sort((a, b) => a - b)
    expect(seeds).toEqual([5, 6, 7, 8])
  })

  it('group 1/2 — both assignments appear over 100 runs (true randomness)', () => {
    const entries: DrawEntry[] = [
      { id: 'a', seedLo: 1, seedHi: 2 },
      { id: 'b', seedLo: 1, seedHi: 2 },
    ]
    const seenAas1 = new Set<boolean>()
    for (let i = 0; i < 100; i++) {
      const result = buildDrawPlan(entries)
      seenAas1.add(result.find((r) => r.id === 'a')!.seed === 1)
    }
    // Both 'a gets seed 1' and 'a gets seed 2' must appear
    expect(seenAas1.has(true)).toBe(true)
    expect(seenAas1.has(false)).toBe(true)
  })

  it('partial group fill — 1 entry in 3/4 group gets one of {3,4}', () => {
    const entries: DrawEntry[] = [{ id: 'a', seedLo: 3, seedHi: 4 }]
    const result = buildDrawPlan(entries)
    expect([3, 4]).toContain(result[0].seed)
  })
})

describe('buildDrawPlan — mixed seeds', () => {
  it('exact + group + unseeded all coexist without collision', () => {
    // seed 1 exact, group 3/4 (2 entries), 2 unseeded
    const entries: DrawEntry[] = [
      { id: 'exact1', seedLo: 1, seedHi: null },
      { id: 'g3a', seedLo: 3, seedHi: 4 },
      { id: 'g3b', seedLo: 3, seedHi: 4 },
      { id: 'u1', seedLo: null, seedHi: null },
      { id: 'u2', seedLo: null, seedHi: null },
    ]
    const result = buildDrawPlan(entries)

    // exact seed preserved
    expect(result.find((r) => r.id === 'exact1')!.seed).toBe(1)

    // group 3/4 occupies {3, 4}
    const groupSeeds = result
      .filter((r) => r.id === 'g3a' || r.id === 'g3b')
      .map((r) => r.seed)
      .sort((a, b) => a - b)
    expect(groupSeeds).toEqual([3, 4])

    // unseeded fills remaining slots {2, 5}
    const unseededSeeds = result
      .filter((r) => r.id === 'u1' || r.id === 'u2')
      .map((r) => r.seed)
      .sort((a, b) => a - b)
    expect(unseededSeeds).toEqual([2, 5])
  })

  it('all seeds in result are unique', () => {
    const entries: DrawEntry[] = [
      { id: 'a', seedLo: 1, seedHi: null },
      { id: 'b', seedLo: 3, seedHi: 4 },
      { id: 'c', seedLo: 3, seedHi: 4 },
      { id: 'd', seedLo: null, seedHi: null },
      { id: 'e', seedLo: null, seedHi: null },
    ]
    const result = buildDrawPlan(entries)
    const seeds = result.map((r) => r.seed)
    expect(new Set(seeds).size).toBe(seeds.length)
  })
})

// ─── 3. resolveDraw (DB) ──────────────────────────────────────────────────────

describe('resolveDraw', () => {
  it('assigns resolved integer seed to all round_teams', () => {
    const { db, roundId, addEntry } = setupRound()
    addEntry('T1', 1, null)  // exact seed 1
    addEntry('T2', 3, 4)     // group 3/4
    addEntry('T3', 3, 4)     // group 3/4
    addEntry('T4', null, null) // unseeded

    resolveDraw(db, roundId)

    const rows = db
      .select()
      .from(schema.round_teams)
      .where(eq(schema.round_teams.round_id, roundId))
      .all()
    for (const row of rows) {
      expect(row.seed).not.toBeNull()
      expect(typeof row.seed).toBe('number')
    }
  })

  it('after resolve, all seeds are unique integers 1..n', () => {
    const { db, roundId, addEntry } = setupRound()
    addEntry('T1', 1, null)
    addEntry('T2', 3, 4)
    addEntry('T3', 3, 4)
    addEntry('T4', null, null)

    resolveDraw(db, roundId)

    const rows = db
      .select({ seed: schema.round_teams.seed })
      .from(schema.round_teams)
      .where(eq(schema.round_teams.round_id, roundId))
      .all()
    const seeds = rows.map((r) => r.seed as number).sort((a, b) => a - b)
    expect(seeds).toEqual([1, 2, 3, 4])
  })

  it('exact seed is preserved after resolve', () => {
    const { db, roundId, addEntry } = setupRound()
    const { roundTeamId } = addEntry('T1', 1, null)
    addEntry('T2', null, null)

    resolveDraw(db, roundId)

    const row = db
      .select({ seed: schema.round_teams.seed })
      .from(schema.round_teams)
      .where(eq(schema.round_teams.id, roundTeamId))
      .get()!
    expect(row.seed).toBe(1)
  })

  it('group 3/4 — both members get seeds from {3,4} after resolve', () => {
    const { db, roundId, addEntry } = setupRound()
    addEntry('T1', 1, null)
    addEntry('T2', 2, null)
    const { roundTeamId: rtA } = addEntry('TA', 3, 4)
    const { roundTeamId: rtB } = addEntry('TB', 3, 4)

    resolveDraw(db, roundId)

    const rowA = db.select({ seed: schema.round_teams.seed }).from(schema.round_teams).where(eq(schema.round_teams.id, rtA)).get()!
    const rowB = db.select({ seed: schema.round_teams.seed }).from(schema.round_teams).where(eq(schema.round_teams.id, rtB)).get()!
    expect([3, 4]).toContain(rowA.seed)
    expect([3, 4]).toContain(rowB.seed)
    expect(rowA.seed).not.toBe(rowB.seed)
  })

  it('fully unseeded round — all entries get unique seeds 1..n', () => {
    const { db, roundId, addEntry } = setupRound()
    addEntry('T1')
    addEntry('T2')
    addEntry('T3')
    addEntry('T4')

    resolveDraw(db, roundId)

    const rows = db
      .select({ seed: schema.round_teams.seed })
      .from(schema.round_teams)
      .where(eq(schema.round_teams.round_id, roundId))
      .all()
    const seeds = rows.map((r) => r.seed as number).sort((a, b) => a - b)
    expect(seeds).toEqual([1, 2, 3, 4])
  })

  it('throws if matches already exist for the round', () => {
    const { db, roundId, addEntry } = setupRound()
    addEntry('T1', 1, null)
    addEntry('T2', 2, null)

    resolveDraw(db, roundId)
    generateBracket(db, roundId)

    expect(() => resolveDraw(db, roundId)).toThrow()
  })

  it('is idempotent — calling resolveDraw twice before generateBracket is allowed', () => {
    const { db, roundId, addEntry } = setupRound()
    addEntry('T1', 1, null)
    addEntry('T2', null, null)
    addEntry('T3', null, null)

    resolveDraw(db, roundId)

    // Second draw is a re-draw (no matches exist yet) — should not throw
    expect(() => resolveDraw(db, roundId)).not.toThrow()

    // Seeds should still be valid after re-draw
    const rows = db
      .select({ seed: schema.round_teams.seed })
      .from(schema.round_teams)
      .where(eq(schema.round_teams.round_id, roundId))
      .all()
    const seeds = rows.map((r) => r.seed as number).sort((a, b) => a - b)
    expect(seeds).toEqual([1, 2, 3])
  })
})

// ─── 4. generateBracket guard ─────────────────────────────────────────────────

describe('generateBracket — unresolved seed guard', () => {
  it('throws if any participant has seed = null', () => {
    const { db, roundId, addEntry } = setupRound()
    // Add teams without calling resolveDraw — seed stays null
    addEntry('T1', 1, null)   // declared seed but not resolved yet
    addEntry('T2', null, null) // unseeded, also not resolved

    expect(() => generateBracket(db, roundId)).toThrow()
  })

  it('does NOT throw after resolveDraw is called', () => {
    const { db, roundId, addEntry } = setupRound()
    addEntry('T1', 1, null)
    addEntry('T2', null, null)

    resolveDraw(db, roundId)

    expect(() => generateBracket(db, roundId)).not.toThrow()
  })

  it('fully unseeded bracket works after resolveDraw', () => {
    const { db, roundId, addEntry } = setupRound()
    for (let i = 0; i < 4; i++) addEntry(`T${i}`)

    resolveDraw(db, roundId)
    const matches = generateBracket(db, roundId)

    expect(matches).toHaveLength(3)
    const ready = matches.filter((m) => m.status === 'ready')
    expect(ready).toHaveLength(2)
  })
})

// ─── 5. Bracket placement guarantees ─────────────────────────────────────────

describe('bracket placement — seeding guarantees after resolveDraw', () => {
  /**
   * Helper: run resolveDraw + generateBracket and return first-round matches.
   * Each first-round match has both teams' resolved seeds accessible via
   * round_teams. We map matchId → {team1Seed, team2Seed} for assertions.
   */
  function getR1WithSeeds(
    db: ReturnType<typeof createTestDb>,
    roundId: string
  ) {
    const matches = generateBracket(db, roundId)
    const r1 = matches.filter((m) => m.left_match_id === null && m.status !== 'walkover')

    // Build teamId → resolved seed map
    const teamSeedMap = new Map<string, number>()
    db.select({ team_id: schema.round_teams.team_id, seed: schema.round_teams.seed })
      .from(schema.round_teams)
      .where(eq(schema.round_teams.round_id, roundId))
      .all()
      .forEach((row) => {
        if (row.seed !== null) teamSeedMap.set(row.team_id, row.seed)
      })

    return { matches, r1, teamSeedMap }
  }

  it('seeds 1 and 2 land in different halves (can only meet in the final)', () => {
    const { db, roundId, addEntry } = setupRound()
    const { roundTeamId: rt1 } = addEntry('T1', 1, null)
    const { roundTeamId: rt2 } = addEntry('T2', 2, null)
    for (let i = 3; i <= 8; i++) addEntry(`T${i}`, i, null)

    resolveDraw(db, roundId)
    const { matches } = getR1WithSeeds(db, roundId)
    const final = matches.find((m) => m.win_match_id === null)!

    // Get resolved seeds to find team IDs for seeds 1 and 2
    const rows = db.select().from(schema.round_teams).where(eq(schema.round_teams.round_id, roundId)).all()
    const team1 = rows.find((r) => r.seed === 1)!.team_id
    const team2 = rows.find((r) => r.seed === 2)!.team_id

    const r1 = matches.filter((m) => m.left_match_id === null)
    const matchOf1 = r1.find((m) => m.team1_id === team1 || m.team2_id === team1)!
    const matchOf2 = r1.find((m) => m.team1_id === team2 || m.team2_id === team2)!

    // Different first-round matches
    expect(matchOf1.id).not.toBe(matchOf2.id)
    // Feed into different semi-finals
    expect(matchOf1.win_match_id).not.toBe(matchOf2.win_match_id)

    void [rt1, rt2, final]
  })

  it('group 3/4 — both members land in different quarters', () => {
    const { db, roundId, addEntry } = setupRound()
    addEntry('T1', 1, null)
    addEntry('T2', 2, null)
    addEntry('TA', 3, 4)
    addEntry('TB', 3, 4)
    for (let i = 5; i <= 8; i++) addEntry(`T${i}`, i, null)

    resolveDraw(db, roundId)
    const { matches } = getR1WithSeeds(db, roundId)

    const rows = db.select().from(schema.round_teams).where(eq(schema.round_teams.round_id, roundId)).all()
    const teamSeed3 = rows.find((r) => r.seed === 3)!.team_id
    const teamSeed4 = rows.find((r) => r.seed === 4)!.team_id

    const r1 = matches.filter((m) => m.left_match_id === null)
    const matchOf3 = r1.find((m) => m.team1_id === teamSeed3 || m.team2_id === teamSeed3)
    const matchOf4 = r1.find((m) => m.team1_id === teamSeed4 || m.team2_id === teamSeed4)

    // Both are present and in different first-round matches
    expect(matchOf3).toBeDefined()
    expect(matchOf4).toBeDefined()
    expect(matchOf3!.id).not.toBe(matchOf4!.id)
    // They feed into different semi-finals (different quarters)
    expect(matchOf3!.win_match_id).not.toBe(matchOf4!.win_match_id)
  })

  it('group 5/8 — all four members land in different eighths (bracket of 8)', () => {
    const { db, roundId, addEntry } = setupRound()
    addEntry('T1', 1, null)
    addEntry('T2', 2, null)
    addEntry('T3', 3, null)
    addEntry('T4', 4, null)
    addEntry('TA', 5, 8)
    addEntry('TB', 5, 8)
    addEntry('TC', 5, 8)
    addEntry('TD', 5, 8)

    resolveDraw(db, roundId)
    const { matches } = getR1WithSeeds(db, roundId)

    const rows = db.select().from(schema.round_teams).where(eq(schema.round_teams.round_id, roundId)).all()
    const group58Teams = rows
      .filter((r) => r.seed !== null && r.seed >= 5 && r.seed <= 8)
      .map((r) => r.team_id)

    const r1 = matches.filter((m) => m.left_match_id === null)
    const r1MatchIds = group58Teams.map((tid) => {
      const m = r1.find((m) => m.team1_id === tid || m.team2_id === tid)
      return m?.id
    })

    // All four members are in distinct first-round matches
    expect(new Set(r1MatchIds).size).toBe(4)
  })

  it('fully unseeded 4-bracket — generateBracket runs without error', () => {
    const { db, roundId, addEntry } = setupRound()
    addEntry('T1')
    addEntry('T2')
    addEntry('T3')
    addEntry('T4')

    resolveDraw(db, roundId)
    const matches = generateBracket(db, roundId)
    expect(matches).toHaveLength(3)
  })

  it('after resolveDraw, no two group-seed members share a first-round match (16-bracket, group 9/16)', () => {
    const { db, roundId, addEntry } = setupRound()
    // 8 exactly-seeded + 8 in group 9/16
    for (let i = 1; i <= 8; i++) addEntry(`T${i}`, i, null)
    for (let i = 0; i < 8; i++) addEntry(`U${i}`, 9, 16)

    resolveDraw(db, roundId)
    const { matches } = getR1WithSeeds(db, roundId)

    const rows = db.select().from(schema.round_teams).where(eq(schema.round_teams.round_id, roundId)).all()
    const group9to16 = rows
      .filter((r) => r.seed !== null && r.seed >= 9 && r.seed <= 16)
      .map((r) => r.team_id)

    const r1 = matches.filter((m) => m.left_match_id === null)
    // No first-round match should contain two members of the 9/16 group
    for (const m of r1) {
      const t1InGroup = group9to16.includes(m.team1_id ?? '')
      const t2InGroup = group9to16.includes(m.team2_id ?? '')
      expect(t1InGroup && t2InGroup).toBe(false)
    }
  })
})
