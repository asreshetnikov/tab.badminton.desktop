import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../db/test-helpers'
import { bergerSchedule, generateMatches, updateStandings } from './round-robin.service'
import { TournamentRepository } from '../db/repositories/tournament.repo'
import { EventRepository } from '../db/repositories/event.repo'
import { PlayerRepository } from '../db/repositories/player.repo'
import { TeamRepository } from '../db/repositories/team.repo'
import { RoundRepository } from '../db/repositories/round.repo'
import { RoundTeamRepository } from '../db/repositories/round-team.repo'
import { MatchRepository } from '../db/repositories/match.repo'
import * as schema from '../db/schema'

// ─── Pure bergerSchedule tests ────────────────────────────────────────────────

describe('bergerSchedule', () => {
  it('returns empty for 0 teams', () => {
    expect(bergerSchedule([])).toHaveLength(0)
  })

  it('returns empty for 1 team', () => {
    expect(bergerSchedule(['A'])).toHaveLength(0)
  })

  it('generates 1 match for 2 teams', () => {
    expect(bergerSchedule(['A', 'B'])).toHaveLength(1)
  })

  it('generates 3 matches for 3 teams', () => {
    expect(bergerSchedule(['A', 'B', 'C'])).toHaveLength(3)
  })

  it('generates 6 matches for 4 teams (n*(n-1)/2)', () => {
    expect(bergerSchedule(['A', 'B', 'C', 'D'])).toHaveLength(6)
  })

  it('generates 10 matches for 5 teams', () => {
    expect(bergerSchedule(['A', 'B', 'C', 'D', 'E'])).toHaveLength(10)
  })

  it('each pair appears exactly once', () => {
    const matches = bergerSchedule(['A', 'B', 'C', 'D'])
    const pairs = matches.map((m) => [m.team1_id, m.team2_id].sort().join('|'))
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('every team appears at most once per tour (even n)', () => {
    const teams = ['A', 'B', 'C', 'D']
    const matches = bergerSchedule(teams)
    const tourMap: Record<number, string[]> = {}
    for (const m of matches) {
      tourMap[m.tour] = tourMap[m.tour] ?? []
      tourMap[m.tour].push(m.team1_id, m.team2_id)
    }
    for (const [, ids] of Object.entries(tourMap)) {
      expect(new Set(ids).size).toBe(ids.length) // no team twice in same tour
      expect(ids.length).toBe(teams.length) // every team plays
    }
  })

  it('every team appears at most once per tour (odd n)', () => {
    const teams = ['A', 'B', 'C', 'D', 'E']
    const matches = bergerSchedule(teams)
    const tourMap: Record<number, string[]> = {}
    for (const m of matches) {
      tourMap[m.tour] = tourMap[m.tour] ?? []
      tourMap[m.tour].push(m.team1_id, m.team2_id)
    }
    for (const [, ids] of Object.entries(tourMap)) {
      expect(new Set(ids).size).toBe(ids.length) // no team twice in same tour
      expect(ids.length).toBe(teams.length - 1) // one team sits out (bye)
    }
  })

  it('number of tours equals n-1 for even n', () => {
    const matches = bergerSchedule(['A', 'B', 'C', 'D'])
    const tours = new Set(matches.map((m) => m.tour))
    expect(tours.size).toBe(3) // 4-1
  })

  it('number of tours equals n for odd n', () => {
    const matches = bergerSchedule(['A', 'B', 'C'])
    const tours = new Set(matches.map((m) => m.tour))
    expect(tours.size).toBe(3) // 3 tours, each team sits out once
  })
})

// ─── generateMatches DB tests ─────────────────────────────────────────────────

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
    name: 'Group Stage',
    type: 'round_robin'
  }).id
  const roundTeamRepo = new RoundTeamRepository(db)

  function addTeam(lastName: string) {
    const playerId = new PlayerRepository(db).create({ first_name: 'A', last_name: lastName }).id
    const teamId = new TeamRepository(db).create({ name: lastName, category: 'MS', player_ids: [playerId] }).id
    roundTeamRepo.add(roundId, teamId)
    return teamId
  }

  return { db, roundId, addTeam }
}

describe('generateMatches', () => {
  it('generates 0 matches for 0 teams', () => {
    const { db, roundId } = setup()
    expect(generateMatches(db, roundId)).toHaveLength(0)
  })

  it('generates 6 matches for 4 teams', () => {
    const { db, roundId, addTeam } = setup()
    addTeam('Alpha'); addTeam('Beta'); addTeam('Gamma'); addTeam('Delta')
    expect(generateMatches(db, roundId)).toHaveLength(6)
  })

  it('all matches have status "scheduled"', () => {
    const { db, roundId, addTeam } = setup()
    addTeam('Alpha'); addTeam('Beta'); addTeam('Gamma')
    expect(generateMatches(db, roundId).every((m) => m.status === 'scheduled')).toBe(true)
  })

  it('matches include team names', () => {
    const { db, roundId, addTeam } = setup()
    addTeam('Alpha'); addTeam('Beta')
    const [m] = generateMatches(db, roundId)
    expect(m.team1).not.toBeNull()
    expect(m.team2).not.toBeNull()
  })

  it('matches include tour number', () => {
    const { db, roundId, addTeam } = setup()
    addTeam('Alpha'); addTeam('Beta'); addTeam('Gamma'); addTeam('Delta')
    const matches = generateMatches(db, roundId)
    expect(matches.every((m) => m.tour !== null)).toBe(true)
    const tours = new Set(matches.map((m) => m.tour))
    expect(tours.size).toBe(3) // 4 teams → 3 tours
  })

  it('throws if matches already generated', () => {
    const { db, roundId, addTeam } = setup()
    addTeam('Alpha'); addTeam('Beta')
    generateMatches(db, roundId)
    expect(() => generateMatches(db, roundId)).toThrow()
  })
})

// ─── updateStandings tests ────────────────────────────────────────────────────

function setupWithMatches() {
  const { db, roundId, addTeam } = setup()
  const t1 = addTeam('Alpha')
  const t2 = addTeam('Beta')
  const t3 = addTeam('Gamma')
  generateMatches(db, roundId)
  const repo = new MatchRepository(db)
  return { db, roundId, t1, t2, t3, repo }
}

function setMatchResult(
  db: ReturnType<typeof createTestDb>,
  matchId: string,
  status: 'finished' | 'walkover' | 'retired',
  winnerId: string | null,
  s1: number,
  s2: number,
  sets: { s1: number; s2: number }[]
) {
  db.update(schema.matches)
    .set({ status, winner_team_id: winnerId, s1, s2 })
    .where(eq(schema.matches.id, matchId))
    .run()
  sets.forEach((set, i) => {
    db.insert(schema.match_sets)
      .values({ id: `set-${matchId}-${i}`, match_id: matchId, order: i + 1, s1: set.s1, s2: set.s2 })
      .run()
  })
}

describe('updateStandings', () => {
  it('all zeros before any results', () => {
    const { db, roundId } = setupWithMatches()
    updateStandings(db, roundId)
    const rows = db.select().from(schema.round_table).where(eq(schema.round_table.round_id, roundId)).all()
    expect(rows.every((r) => r.wins === 0 && r.losses === 0)).toBe(true)
  })

  it('counts wins and losses correctly', () => {
    const { db, roundId, t1, t2, repo } = setupWithMatches()
    const matches = repo.listByRound(roundId)
    // find the t1 vs t2 match
    const m = matches.find(
      (m) => (m.team1_id === t1 && m.team2_id === t2) || (m.team1_id === t2 && m.team2_id === t1)
    )!
    const winnerId = m.team1_id === t1 ? t1 : t2
    setMatchResult(db, m.id, 'finished', winnerId, 2, 0, [{ s1: 21, s2: 10 }, { s1: 21, s2: 15 }])
    updateStandings(db, roundId)

    const rows = db.select().from(schema.round_table).where(eq(schema.round_table.round_id, roundId)).all()
    const r1 = rows.find((r) => r.team_id === t1)!
    const r2 = rows.find((r) => r.team_id === t2)!
    expect(r1.wins).toBe(1)
    expect(r1.losses).toBe(0)
    expect(r2.wins).toBe(0)
    expect(r2.losses).toBe(1)
  })

  it('accumulates sets won and lost', () => {
    const { db, roundId, t1, t2, repo } = setupWithMatches()
    const matches = repo.listByRound(roundId)
    const m = matches.find(
      (m) => (m.team1_id === t1 && m.team2_id === t2) || (m.team1_id === t2 && m.team2_id === t1)
    )!
    const isT1Home = m.team1_id === t1
    // t1 wins 2-1
    setMatchResult(
      db, m.id, 'finished',
      t1,
      isT1Home ? 2 : 1,
      isT1Home ? 1 : 2,
      isT1Home
        ? [{ s1: 21, s2: 15 }, { s1: 14, s2: 21 }, { s1: 21, s2: 18 }]
        : [{ s1: 15, s2: 21 }, { s1: 21, s2: 14 }, { s1: 18, s2: 21 }]
    )
    updateStandings(db, roundId)

    const rows = db.select().from(schema.round_table).where(eq(schema.round_table.round_id, roundId)).all()
    const r1 = rows.find((r) => r.team_id === t1)!
    const r2 = rows.find((r) => r.team_id === t2)!
    expect(r1.sets_won).toBe(2)
    expect(r1.sets_lost).toBe(1)
    expect(r2.sets_won).toBe(1)
    expect(r2.sets_lost).toBe(2)
  })

  it('accumulates points won and lost from match_sets', () => {
    const { db, roundId, t1, t2, repo } = setupWithMatches()
    const matches = repo.listByRound(roundId)
    const m = matches.find(
      (m) => (m.team1_id === t1 && m.team2_id === t2) || (m.team1_id === t2 && m.team2_id === t1)
    )!
    const isT1Home = m.team1_id === t1
    setMatchResult(
      db, m.id, 'finished',
      t1,
      isT1Home ? 2 : 0,
      isT1Home ? 0 : 2,
      isT1Home
        ? [{ s1: 21, s2: 10 }, { s1: 21, s2: 15 }]
        : [{ s1: 10, s2: 21 }, { s1: 15, s2: 21 }]
    )
    updateStandings(db, roundId)

    const rows = db.select().from(schema.round_table).where(eq(schema.round_table.round_id, roundId)).all()
    const r1 = rows.find((r) => r.team_id === t1)!
    expect(r1.points_won).toBe(42)
    expect(r1.points_lost).toBe(25)
  })

  it('walkover counts as a win with no sets', () => {
    const { db, roundId, t1, t2, repo } = setupWithMatches()
    const matches = repo.listByRound(roundId)
    const m = matches.find(
      (m) => (m.team1_id === t1 && m.team2_id === t2) || (m.team1_id === t2 && m.team2_id === t1)
    )!
    const isT1Home = m.team1_id === t1
    setMatchResult(
      db, m.id, 'walkover',
      t1,
      isT1Home ? 1 : 0,
      isT1Home ? 0 : 1,
      []
    )
    updateStandings(db, roundId)

    const rows = db.select().from(schema.round_table).where(eq(schema.round_table.round_id, roundId)).all()
    const r1 = rows.find((r) => r.team_id === t1)!
    expect(r1.wins).toBe(1)
    expect(r1.sets_won).toBe(isT1Home ? 1 : 0)
  })

  it('assigns positions: winner first', () => {
    const { db, roundId, t1, t2, repo } = setupWithMatches()
    const matches = repo.listByRound(roundId)
    const m = matches.find(
      (m) => (m.team1_id === t1 && m.team2_id === t2) || (m.team1_id === t2 && m.team2_id === t1)
    )!
    setMatchResult(db, m.id, 'finished', t1, 2, 0, [{ s1: 21, s2: 10 }, { s1: 21, s2: 15 }])
    updateStandings(db, roundId)

    const rows = db.select().from(schema.round_table).where(eq(schema.round_table.round_id, roundId)).all()
    const r1 = rows.find((r) => r.team_id === t1)!
    const r2 = rows.find((r) => r.team_id === t2)!
    expect(r1.position).toBe(1)
    expect(r2.position!).toBeGreaterThan(1)
  })

  it('recalculates correctly after second update', () => {
    const { db, roundId, t1, t2, repo } = setupWithMatches()
    const matches = repo.listByRound(roundId)
    const m = matches.find(
      (m) => (m.team1_id === t1 && m.team2_id === t2) || (m.team1_id === t2 && m.team2_id === t1)
    )!
    // First: t1 wins
    setMatchResult(db, m.id, 'finished', t1, 2, 0, [{ s1: 21, s2: 10 }, { s1: 21, s2: 15 }])
    updateStandings(db, roundId)

    // Reset match to re-enter: t2 wins instead
    db.delete(schema.match_sets).where(eq(schema.match_sets.match_id, m.id)).run()
    setMatchResult(db, m.id, 'finished', t2, 0, 2, [{ s1: 10, s2: 21 }, { s1: 15, s2: 21 }])
    updateStandings(db, roundId)

    const rows = db.select().from(schema.round_table).where(eq(schema.round_table.round_id, roundId)).all()
    const r2 = rows.find((r) => r.team_id === t2)!
    expect(r2.wins).toBe(1)
    expect(r2.position).toBe(1)
  })
})
