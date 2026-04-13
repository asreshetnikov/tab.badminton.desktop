import { describe, it, expect } from 'vitest'
import { createTestDb } from '../db/test-helpers'
import { bergerSchedule, generateMatches } from './round-robin.service'
import { TournamentRepository } from '../db/repositories/tournament.repo'
import { EventRepository } from '../db/repositories/event.repo'
import { PlayerRepository } from '../db/repositories/player.repo'
import { TeamRepository } from '../db/repositories/team.repo'
import { RoundRepository } from '../db/repositories/round.repo'
import { RoundTeamRepository } from '../db/repositories/round-team.repo'

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
