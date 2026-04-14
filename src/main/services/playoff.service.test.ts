import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../db/test-helpers'
import { buildSeedingOrder, nextPowerOf2, generateBracket } from './playoff.service'
import { TournamentRepository } from '../db/repositories/tournament.repo'
import { EventRepository } from '../db/repositories/event.repo'
import { PlayerRepository } from '../db/repositories/player.repo'
import { TeamRepository } from '../db/repositories/team.repo'
import { RoundRepository } from '../db/repositories/round.repo'
import { RoundTeamRepository } from '../db/repositories/round-team.repo'
import * as schema from '../db/schema'

// ─── Pure function tests ──────────────────────────────────────────────────────

describe('nextPowerOf2', () => {
  it('returns 2 for 2', () => expect(nextPowerOf2(2)).toBe(2))
  it('returns 4 for 3', () => expect(nextPowerOf2(3)).toBe(4))
  it('returns 4 for 4', () => expect(nextPowerOf2(4)).toBe(4))
  it('returns 8 for 5', () => expect(nextPowerOf2(5)).toBe(8))
  it('returns 8 for 8', () => expect(nextPowerOf2(8)).toBe(8))
  it('returns 16 for 9', () => expect(nextPowerOf2(9)).toBe(16))
  it('returns 1 for 1', () => expect(nextPowerOf2(1)).toBe(1))
})

describe('buildSeedingOrder', () => {
  it('n=2 returns [1, 2]', () => {
    expect(buildSeedingOrder(2)).toEqual([1, 2])
  })

  it('n=4: adjacent pairs sum to n+1', () => {
    const order = buildSeedingOrder(4)
    expect(order[0] + order[1]).toBe(5) // 1 + 4
    expect(order[2] + order[3]).toBe(5) // 2 + 3
  })

  it('n=8: all adjacent pairs sum to n+1', () => {
    const order = buildSeedingOrder(8)
    for (let i = 0; i < 8; i += 2) {
      expect(order[i] + order[i + 1]).toBe(9)
    }
  })

  it('n=8: seed 1 occupies slot 0', () => {
    expect(buildSeedingOrder(8)[0]).toBe(1)
  })

  it('n=8: seeds 1 and 2 are in opposite halves', () => {
    const order = buildSeedingOrder(8)
    const idx1 = order.indexOf(1)
    const idx2 = order.indexOf(2)
    expect(Math.floor(idx1 / 4)).not.toBe(Math.floor(idx2 / 4))
  })

  it('n=8: contains each seed from 1 to 8 exactly once', () => {
    const order = buildSeedingOrder(8)
    expect([...order].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('n=16: seeds 1 and 2 are in opposite halves', () => {
    const order = buildSeedingOrder(16)
    const idx1 = order.indexOf(1)
    const idx2 = order.indexOf(2)
    expect(Math.floor(idx1 / 8)).not.toBe(Math.floor(idx2 / 8))
  })
})

// ─── DB tests ─────────────────────────────────────────────────────────────────

function setup() {
  const db = createTestDb()
  const tournamentId = new TournamentRepository(db).create({
    name: 'Test Cup',
    date_start: '2025-06-01',
    date_end: '2025-06-02'
  }).id
  const eventId = new EventRepository(db).create({
    tournament_id: tournamentId,
    name: "Men's Singles",
    category: 'MS'
  }).id
  const roundId = new RoundRepository(db).create({
    event_id: eventId,
    name: 'Playoff',
    type: 'playoff'
  }).id
  const roundTeamRepo = new RoundTeamRepository(db)

  function addTeam(name: string, seed: number) {
    const playerId = new PlayerRepository(db).create({ first_name: 'A', last_name: name }).id
    const teamId = new TeamRepository(db).create({ name, category: 'MS', player_ids: [playerId] }).id
    const rt = roundTeamRepo.add(roundId, teamId)
    db.update(schema.round_teams).set({ seed }).where(eq(schema.round_teams.id, rt.id)).run()
    return teamId
  }

  return { db, roundId, addTeam }
}

describe('generateBracket', () => {
  it('throws if matches already exist for the round', () => {
    const { db, roundId, addTeam } = setup()
    addTeam('Alpha', 1)
    addTeam('Beta', 2)
    generateBracket(db, roundId)
    expect(() => generateBracket(db, roundId)).toThrow()
  })

  it('8 teams → 7 matches total (4 R1 + 2 semis + 1 final), no walkovers', () => {
    const { db, roundId, addTeam } = setup()
    for (let i = 1; i <= 8; i++) addTeam(`T${i}`, i)
    const matches = generateBracket(db, roundId)
    expect(matches).toHaveLength(7)
    expect(matches.filter((m) => m.status === 'walkover')).toHaveLength(0)
    expect(matches.filter((m) => m.status === 'scheduled')).toHaveLength(7)
  })

  it('8 teams → 4 first-round matches, each with both teams set', () => {
    const { db, roundId, addTeam } = setup()
    for (let i = 1; i <= 8; i++) addTeam(`T${i}`, i)
    const matches = generateBracket(db, roundId)
    const r1 = matches.filter((m) => m.left_match_id === null)
    expect(r1).toHaveLength(4)
    for (const m of r1) {
      expect(m.team1_id).not.toBeNull()
      expect(m.team2_id).not.toBeNull()
    }
  })

  it('5 teams → bracket 8 → 7 matches, 3 walkovers', () => {
    const { db, roundId, addTeam } = setup()
    for (let i = 1; i <= 5; i++) addTeam(`T${i}`, i)
    const matches = generateBracket(db, roundId)
    expect(matches).toHaveLength(7)
    expect(matches.filter((m) => m.status === 'walkover')).toHaveLength(3)
  })

  it('5 teams → exactly 1 actual first-round match (seeds 4 vs 5)', () => {
    const { db, roundId, addTeam } = setup()
    const teams: string[] = []
    for (let i = 1; i <= 5; i++) teams.push(addTeam(`T${i}`, i))
    const matches = generateBracket(db, roundId)
    const r1Real = matches.filter(
      (m) => m.left_match_id === null && m.status === 'scheduled'
    )
    expect(r1Real).toHaveLength(1)
    // The real R1 match should be between seeds 4 and 5
    const t4 = teams[3]
    const t5 = teams[4]
    const [realMatch] = r1Real
    const participants = new Set([realMatch.team1_id, realMatch.team2_id])
    expect(participants.has(t4)).toBe(true)
    expect(participants.has(t5)).toBe(true)
  })

  it('bye match has winner_team_id set automatically', () => {
    const { db, roundId, addTeam } = setup()
    const t1 = addTeam('T1', 1)
    for (let i = 2; i <= 5; i++) addTeam(`T${i}`, i)
    const matches = generateBracket(db, roundId)
    const byeForT1 = matches.find(
      (m) => (m.team1_id === t1 || m.team2_id === t1) && m.status === 'walkover'
    )
    expect(byeForT1).toBeDefined()
    expect(byeForT1!.winner_team_id).toBe(t1)
    // The opposing slot is null (bye)
    const byeSlot = byeForT1!.team1_id === t1 ? byeForT1!.team2_id : byeForT1!.team1_id
    expect(byeSlot).toBeNull()
  })

  it('bye winner propagates into the correct slot of the parent match', () => {
    const { db, roundId, addTeam } = setup()
    const t1 = addTeam('T1', 1)
    for (let i = 2; i <= 5; i++) addTeam(`T${i}`, i)
    const matches = generateBracket(db, roundId)

    const byeForT1 = matches.find(
      (m) => (m.team1_id === t1 || m.team2_id === t1) && m.status === 'walkover'
    )!
    const parent = matches.find((m) => m.id === byeForT1.win_match_id)
    expect(parent).toBeDefined()
    // t1 should already occupy a slot in the parent
    expect(parent!.team1_id === t1 || parent!.team2_id === t1).toBe(true)
  })

  it('final has no win_match_id', () => {
    const { db, roundId, addTeam } = setup()
    for (let i = 1; i <= 4; i++) addTeam(`T${i}`, i)
    const matches = generateBracket(db, roundId)
    const finals = matches.filter((m) => m.win_match_id === null)
    expect(finals).toHaveLength(1)
  })

  it('every non-final match has a win_match_id', () => {
    const { db, roundId, addTeam } = setup()
    for (let i = 1; i <= 8; i++) addTeam(`T${i}`, i)
    const matches = generateBracket(db, roundId)
    const nonFinal = matches.filter((m) => m.win_match_id !== null)
    expect(nonFinal).toHaveLength(6) // 7 total - 1 final
  })

  it('semi-finals have correct left/right_match_id pointing to R1 matches', () => {
    const { db, roundId, addTeam } = setup()
    for (let i = 1; i <= 8; i++) addTeam(`T${i}`, i)
    const matches = generateBracket(db, roundId)
    const r1Ids = new Set(matches.filter((m) => m.left_match_id === null).map((m) => m.id))
    const semis = matches.filter((m) => m.left_match_id !== null && m.win_match_id !== null)
    expect(semis).toHaveLength(2)
    for (const semi of semis) {
      expect(r1Ids.has(semi.left_match_id!)).toBe(true)
      expect(r1Ids.has(semi.right_match_id!)).toBe(true)
    }
  })

  it('final has left/right_match_id pointing to the two semi-finals', () => {
    const { db, roundId, addTeam } = setup()
    for (let i = 1; i <= 8; i++) addTeam(`T${i}`, i)
    const matches = generateBracket(db, roundId)
    const final = matches.find((m) => m.win_match_id === null)!
    const semiIds = new Set(
      matches.filter((m) => m.left_match_id !== null && m.win_match_id !== null).map((m) => m.id)
    )
    expect(semiIds.has(final.left_match_id!)).toBe(true)
    expect(semiIds.has(final.right_match_id!)).toBe(true)
  })

  it('seeds 1 and 2 are in opposite halves of the bracket', () => {
    const { db, roundId, addTeam } = setup()
    const t1 = addTeam('T1', 1)
    const t2 = addTeam('T2', 2)
    for (let i = 3; i <= 8; i++) addTeam(`T${i}`, i)
    const matches = generateBracket(db, roundId)
    const r1 = matches.filter((m) => m.left_match_id === null)
    const matchForT1 = r1.find((m) => m.team1_id === t1 || m.team2_id === t1)!
    const matchForT2 = r1.find((m) => m.team1_id === t2 || m.team2_id === t2)!
    // They should feed into different semi-finals
    expect(matchForT1.win_match_id).not.toBe(matchForT2.win_match_id)
  })

  it('each first-round pair of teams sums to bracketSize+1 by seed', () => {
    // Verifies standard seeding: seed 1 vs seed 8, seed 2 vs seed 7, etc.
    const { db, roundId, addTeam } = setup()
    const teams: Record<number, string> = {}
    for (let i = 1; i <= 8; i++) teams[i] = addTeam(`T${i}`, i)

    // Map teamId → seed number
    const teamSeed: Record<string, number> = {}
    for (const [s, id] of Object.entries(teams)) teamSeed[id] = Number(s)

    const matches = generateBracket(db, roundId)
    const r1 = matches.filter((m) => m.left_match_id === null)
    for (const m of r1) {
      const s1 = teamSeed[m.team1_id!]
      const s2 = teamSeed[m.team2_id!]
      expect(s1 + s2).toBe(9) // 8+1
    }
  })
})

// ─── Group seeding tests ───────────────────────────────────────────────────────
// These tests verify that when teams from different groups are seeded
// (group A leader = seed 1, group B leader = seed 2, etc.), the bracket
// places them correctly so they can only meet in the final.

describe('generateBracket - group seeding placement', () => {
  it('group leaders from 2 groups (seeds 1 and 2) land in opposite halves', () => {
    const { db, roundId, addTeam } = setup()
    const groupALeader = addTeam('A1', 1)
    const groupBLeader = addTeam('B1', 2)
    addTeam('A2', 3)
    addTeam('B2', 4)

    const matches = generateBracket(db, roundId)
    const r1 = matches.filter((m) => m.left_match_id === null)

    const matchA = r1.find((m) => m.team1_id === groupALeader || m.team2_id === groupALeader)!
    const matchB = r1.find((m) => m.team1_id === groupBLeader || m.team2_id === groupBLeader)!

    // Different first-round matches → different semi-finals → can only meet in the final
    expect(matchA.id).not.toBe(matchB.id)
    expect(matchA.win_match_id).not.toBe(matchB.win_match_id)
  })

  it('no first-round match pairs two group leaders (seeds 1 and 2)', () => {
    const { db, roundId, addTeam } = setup()
    const groupALeader = addTeam('A1', 1)
    const groupBLeader = addTeam('B1', 2)
    addTeam('A2', 3)
    addTeam('B2', 4)

    const matches = generateBracket(db, roundId)
    const r1 = matches.filter((m) => m.left_match_id === null)

    const pairedWithLeader = r1.find(
      (m) =>
        (m.team1_id === groupALeader || m.team2_id === groupALeader) &&
        (m.team1_id === groupBLeader || m.team2_id === groupBLeader)
    )
    expect(pairedWithLeader).toBeUndefined()
  })

  it('4 groups with 2 qualifiers each → 8-bracket, no two group leaders share a semi-final', () => {
    // Seeds: A1=1, B1=2, C1=3, D1=4, A2=5, B2=6, C2=7, D2=8
    // buildSeedingOrder(8) = [1,8,4,5,2,7,3,6]
    // R1 matches: 1v8, 4v5, 2v7, 3v6 → all cross-group ✓
    // SFs: winner(1v8) vs winner(4v5), winner(2v7) vs winner(3v6)
    // SF1 involves groups A,D; SF2 involves groups B,C → no two leaders share a SF
    const { db, roundId, addTeam } = setup()
    const leaders: string[] = []
    for (let g = 0; g < 4; g++) {
      leaders.push(addTeam(`G${g}L1`, g + 1))       // seeds 1-4: group leaders
      addTeam(`G${g}L2`, g + 5)                       // seeds 5-8: group runners-up
    }

    const matches = generateBracket(db, roundId)
    const semis = matches.filter((m) => m.left_match_id !== null && m.win_match_id !== null)

    for (const semi of semis) {
      // Collect all R1 matches feeding into this semi
      const feedingR1 = matches.filter(
        (m) => m.left_match_id === null && m.win_match_id === semi.id
      )
      const teamsInSemiPath = new Set(
        feedingR1.flatMap((m) => [m.team1_id, m.team2_id]).filter(Boolean)
      )
      const leadersInSemiPath = leaders.filter((l) => teamsInSemiPath.has(l))
      // Each semi-final path should contain at most 1 group leader (seeds 1-4)
      expect(leadersInSemiPath.length).toBeLessThanOrEqual(1)
    }
  })

  it('group runner-up (seed 3) faces group leader (seed 2) in R1, not own group leader (seed 1)', () => {
    // 2 groups: A1=seed1, B1=seed2, A2=seed3, B2=seed4
    // buildSeedingOrder(4)=[1,4,2,3]: match0: seed1 vs seed4 (A1 vs B2), match1: seed2 vs seed3 (B1 vs A2)
    // A2 (seed3) faces B1 (seed2), NOT A1 (seed1) → cross-group in R1
    const { db, roundId, addTeam } = setup()
    const groupALeader = addTeam('A1', 1)
    const groupBLeader = addTeam('B1', 2)
    const groupARunner = addTeam('A2', 3)
    addTeam('B2', 4)

    const matches = generateBracket(db, roundId)
    const r1 = matches.filter((m) => m.left_match_id === null)

    const matchWithA2 = r1.find(
      (m) => m.team1_id === groupARunner || m.team2_id === groupARunner
    )!
    const opponentOfA2 = matchWithA2.team1_id === groupARunner
      ? matchWithA2.team2_id
      : matchWithA2.team1_id

    expect(opponentOfA2).toBe(groupBLeader)
    expect(opponentOfA2).not.toBe(groupALeader)
  })
})
