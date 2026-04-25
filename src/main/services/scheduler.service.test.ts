import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../db/test-helpers'
import { TournamentRepository } from '../db/repositories/tournament.repo'
import { EventRepository } from '../db/repositories/event.repo'
import { PlayerRepository } from '../db/repositories/player.repo'
import { TeamRepository } from '../db/repositories/team.repo'
import { RoundRepository } from '../db/repositories/round.repo'
import { RoundTeamRepository } from '../db/repositories/round-team.repo'
import { generateBracket } from './playoff.service'
import { autoSchedule } from './scheduler.service'
import * as schema from '../db/schema'
import type { EventCategory } from '@shared/types/event'

const DEFAULT_DURATION_MINUTES = 60
const MINUTE = 60 * 1000

function setupPlayoffTournament(options?: { restMinutes?: number; courtCount?: number; teamCount?: number }) {
  const db = createTestDb()
  const tournament = new TournamentRepository(db).create({
    name: 'Scheduler Cup',
    date_start: '2026-04-14',
    date_end: '2026-04-14',
    status: 'in_progress'
  })

  db.update(schema.tournaments)
    .set({ rest_minutes: options?.restMinutes ?? 30 })
    .where(eq(schema.tournaments.id, tournament.id))
    .run()

  const courtCount = options?.courtCount ?? 2
  for (let i = 1; i <= courtCount; i++) {
    db.insert(schema.courts)
      .values({ id: `court-${i}`, tournament_id: tournament.id, name: `Court ${i}` })
      .run()
  }

  const event = new EventRepository(db).create({
    tournament_id: tournament.id,
    name: "Men's Singles",
    category: 'MS'
  })
  const round = new RoundRepository(db).create({
    event_id: event.id,
    name: 'Playoff',
    type: 'playoff'
  })

  const roundTeams = new RoundTeamRepository(db)
  const teamCount = options?.teamCount ?? 8
  for (let i = 1; i <= teamCount; i++) {
    const player = new PlayerRepository(db).create({
      first_name: `Player`,
      last_name: String(i),
      gender: 'M'
    })
    const team = new TeamRepository(db).create({
      name: `Team ${i}`,
      category: 'MS',
      player_ids: [player.id]
    })
    const roundTeam = roundTeams.add(round.id, team.id)
    db.update(schema.round_teams)
      .set({ seed: i })
      .where(eq(schema.round_teams.id, roundTeam.id))
      .run()
  }

  generateBracket(db, round.id)

  return { db, tournamentId: tournament.id, roundId: round.id, restMinutes: options?.restMinutes ?? 30 }
}

function listRoundMatches(db: ReturnType<typeof createTestDb>, roundId: string) {
  return db.select().from(schema.matches).where(eq(schema.matches.round_id, roundId)).all()
}

function computeBracketRounds(
  matches: ReturnType<typeof listRoundMatches>
): Map<string, number> {
  const byId = new Map(matches.map((m) => [m.id, m]))
  const memo = new Map<string, number>()

  function level(matchId: string): number {
    const cached = memo.get(matchId)
    if (cached !== undefined) return cached
    const match = byId.get(matchId)
    if (!match) return 1
    const childLevels = [match.left_match_id, match.right_match_id]
      .filter((id): id is string => id !== null)
      .map(level)
    const value = childLevels.length === 0 ? 1 : Math.max(...childLevels) + 1
    memo.set(matchId, value)
    return value
  }

  matches.forEach((m) => level(m.id))
  return memo
}

function startMs(value: string | null): number {
  expect(value).not.toBeNull()
  return new Date(value!).getTime()
}

function matchesByBracketRound(
  matches: ReturnType<typeof listRoundMatches>
): Map<number, ReturnType<typeof listRoundMatches>> {
  const bracketRounds = computeBracketRounds(matches)
  const result = new Map<number, ReturnType<typeof listRoundMatches>>()
  for (const match of matches) {
    const round = bracketRounds.get(match.id)!
    if (!result.has(round)) result.set(round, [])
    result.get(round)!.push(match)
  }
  return result
}

function earliestStart(matches: ReturnType<typeof listRoundMatches>): number {
  return Math.min(...matches.map((m) => startMs(m.scheduled_at)))
}

function latestStart(matches: ReturnType<typeof listRoundMatches>): number {
  return Math.max(...matches.map((m) => startMs(m.scheduled_at)))
}

function dependencyReadyMs(
  match: ReturnType<typeof listRoundMatches>[number],
  byId: Map<string, ReturnType<typeof listRoundMatches>[number]>,
  bracketRounds: Map<string, number>,
  durationForBracketRound: (bracketRound: number) => number,
  restMinutes: number
): number {
  let readyMs = 0
  for (const childId of [match.left_match_id, match.right_match_id]) {
    if (!childId) continue
    const child = byId.get(childId)!
    const childRound = bracketRounds.get(child.id)!
    readyMs = Math.max(
      readyMs,
      startMs(child.scheduled_at) + (durationForBracketRound(childRound) + restMinutes) * MINUTE
    )
  }
  return readyMs
}

function addStageDuration(
  db: ReturnType<typeof createTestDb>,
  tournamentId: string,
  bracketRound: number,
  durationMinutes: number
): void {
  db.insert(schema.tournament_stage_durations)
    .values({
      id: `stage-${bracketRound}-${durationMinutes}`,
      tournament_id: tournamentId,
      bracket_round: bracketRound,
      duration_minutes: durationMinutes
    })
    .run()
}

function addPlayoffRound(
  db: ReturnType<typeof createTestDb>,
  tournamentId: string,
  category: EventCategory,
  namePrefix: string,
  teamCount = 4
): string {
  const event = new EventRepository(db).create({
    tournament_id: tournamentId,
    name: `${namePrefix} Event`,
    category
  })
  const round = new RoundRepository(db).create({
    event_id: event.id,
    name: `${namePrefix} Playoff`,
    type: 'playoff'
  })
  const roundTeams = new RoundTeamRepository(db)

  for (let i = 1; i <= teamCount; i++) {
    const player = new PlayerRepository(db).create({
      first_name: namePrefix,
      last_name: String(i),
      gender: category === 'WS' || category === 'WD' ? 'F' : 'M'
    })
    const team = new TeamRepository(db).create({
      name: `${namePrefix} Team ${i}`,
      category,
      player_ids: [player.id]
    })
    const roundTeam = roundTeams.add(round.id, team.id)
    db.update(schema.round_teams)
      .set({ seed: i })
      .where(eq(schema.round_teams.id, roundTeam.id))
      .run()
  }

  generateBracket(db, round.id)
  return round.id
}

function finalMatch(matches: ReturnType<typeof listRoundMatches>) {
  return matches.find((m) => m.win_match_id === null)!
}

describe('autoSchedule preliminary playoff schedule', () => {
  it('assigns scheduled_at to future playoff matches without known participants', () => {
    const { db, tournamentId, roundId } = setupPlayoffTournament()
    const futureMatchIds = listRoundMatches(db, roundId)
      .filter((m) => m.status === 'scheduled' && !m.team1_id && !m.team2_id)
      .map((m) => m.id)

    expect(futureMatchIds).toHaveLength(3)

    autoSchedule(db, tournamentId)

    const matches = listRoundMatches(db, roundId)
    const futureMatches = matches.filter((m) => futureMatchIds.includes(m.id))

    expect(futureMatches).toHaveLength(3)
    expect(futureMatches.every((m) => m.scheduled_at !== null)).toBe(true)
  })

  it('does not rewrite completed matches', () => {
    const { db, tournamentId, roundId } = setupPlayoffTournament()
    const final = listRoundMatches(db, roundId).find((m) => m.win_match_id === null)!
    const existingTime = '2026-04-14T18:00:00'

    db.update(schema.matches)
      .set({ status: 'finished', scheduled_at: existingTime, s1: 2, s2: 0 })
      .where(eq(schema.matches.id, final.id))
      .run()

    autoSchedule(db, tournamentId)

    const updatedFinal = db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, final.id))
      .get()!

    expect(updatedFinal.status).toBe('finished')
    expect(updatedFinal.scheduled_at).toBe(existingTime)
    expect(updatedFinal.s1).toBe(2)
    expect(updatedFinal.s2).toBe(0)
  })

  it('schedules every parent match after its child matches plus rest time', () => {
    const restMinutes = 30
    const { db, tournamentId, roundId } = setupPlayoffTournament({ restMinutes })

    autoSchedule(db, tournamentId)

    const matches = listRoundMatches(db, roundId)
    const byId = new Map(matches.map((m) => [m.id, m]))
    const requiredGapMs = (DEFAULT_DURATION_MINUTES + restMinutes) * 60 * 1000

    for (const parent of matches.filter((m) => m.left_match_id || m.right_match_id)) {
      const parentStart = startMs(parent.scheduled_at)
      for (const childId of [parent.left_match_id, parent.right_match_id]) {
        if (!childId) continue
        const child = byId.get(childId)!
        expect(parentStart).toBeGreaterThanOrEqual(startMs(child.scheduled_at) + requiredGapMs)
      }
    }
  })

  it('orders bracket levels from first round toward the final', () => {
    const restMinutes = 30
    const { db, tournamentId, roundId } = setupPlayoffTournament({ restMinutes })

    autoSchedule(db, tournamentId)

    const matches = listRoundMatches(db, roundId)
    const bracketRounds = computeBracketRounds(matches)
    const byId = new Map(matches.map((m) => [m.id, m]))

    for (const parent of matches.filter((m) => m.left_match_id || m.right_match_id)) {
      for (const childId of [parent.left_match_id, parent.right_match_id]) {
        if (!childId) continue
        expect(bracketRounds.get(parent.id)).toBeGreaterThan(bracketRounds.get(childId)!)
        expect(startMs(parent.scheduled_at)).toBeGreaterThanOrEqual(
          dependencyReadyMs(parent, byId, bracketRounds, () => DEFAULT_DURATION_MINUTES, restMinutes)
        )
      }
    }
  })

  it('uses stage duration when computing parent not-before and current court occupancy', () => {
    const restMinutes = 30
    const { db, tournamentId, roundId } = setupPlayoffTournament({ restMinutes })
    addStageDuration(db, tournamentId, 1, 45)
    addStageDuration(db, tournamentId, 2, 75)

    autoSchedule(db, tournamentId)

    const matches = listRoundMatches(db, roundId)
    const bracketRounds = computeBracketRounds(matches)
    const byId = new Map(matches.map((m) => [m.id, m]))
    const byRound = matchesByBracketRound(matches)
    const semis = byRound.get(2)!
    const final = byRound.get(3)![0]
    const durationForBracketRound = (bracketRound: number) => bracketRound === 1 ? 45 : 75

    for (const semi of semis) {
      expect(startMs(semi.scheduled_at)).toBeGreaterThanOrEqual(
        dependencyReadyMs(semi, byId, bracketRounds, durationForBracketRound, restMinutes)
      )
    }
    expect(startMs(final.scheduled_at)).toBe(
      dependencyReadyMs(final, byId, bracketRounds, durationForBracketRound, restMinutes)
    )
  })

  it('uses tournament day match duration when no stage duration is set', () => {
    const restMinutes = 30
    const dayDuration = 40
    const { db, tournamentId, roundId } = setupPlayoffTournament({ restMinutes })

    db.insert(schema.tournament_day_settings)
      .values({
        id: 'day-settings',
        tournament_id: tournamentId,
        date: '2026-04-14',
        start_time: '09:00',
        match_duration: dayDuration
      })
      .run()

    autoSchedule(db, tournamentId)

    const matches = listRoundMatches(db, roundId)
    const bracketRounds = computeBracketRounds(matches)
    const byId = new Map(matches.map((m) => [m.id, m]))
    const byRound = matchesByBracketRound(matches)
    const semis = byRound.get(2)!
    const final = byRound.get(3)![0]

    for (const semi of semis) {
      expect(startMs(semi.scheduled_at)).toBeGreaterThanOrEqual(
        dependencyReadyMs(semi, byId, bracketRounds, () => dayDuration, restMinutes)
      )
    }
    expect(startMs(final.scheduled_at)).toBe(
      dependencyReadyMs(final, byId, bracketRounds, () => dayDuration, restMinutes)
    )
  })

  it('uses the default 60-minute duration when no duration settings exist', () => {
    const restMinutes = 30
    const { db, tournamentId, roundId } = setupPlayoffTournament({ restMinutes })

    autoSchedule(db, tournamentId)

    const matches = listRoundMatches(db, roundId)
    const bracketRounds = computeBracketRounds(matches)
    const byId = new Map(matches.map((m) => [m.id, m]))
    const byRound = matchesByBracketRound(matches)
    const semis = byRound.get(2)!

    for (const semi of semis) {
      expect(startMs(semi.scheduled_at)).toBeGreaterThanOrEqual(
        dependencyReadyMs(semi, byId, bracketRounds, () => DEFAULT_DURATION_MINUTES, restMinutes)
      )
    }
  })

  it('shifts parent matches according to tournament rest_minutes', () => {
    const lowRest = setupPlayoffTournament({ restMinutes: 0 })
    const highRest = setupPlayoffTournament({ restMinutes: 90 })

    autoSchedule(lowRest.db, lowRest.tournamentId)
    autoSchedule(highRest.db, highRest.tournamentId)

    const lowMatches = listRoundMatches(lowRest.db, lowRest.roundId)
    const highMatches = listRoundMatches(highRest.db, highRest.roundId)
    const lowRounds = matchesByBracketRound(lowMatches)
    const highRounds = matchesByBracketRound(highMatches)
    const lowFinal = lowRounds.get(3)![0]
    const highFinal = highRounds.get(3)![0]

    const lowGap = startMs(lowFinal.scheduled_at) - latestStart(lowRounds.get(2)!)
    const highGap = startMs(highFinal.scheduled_at) - latestStart(highRounds.get(2)!)

    expect(lowGap).toBe((DEFAULT_DURATION_MINUTES + 0) * MINUTE)
    expect(highGap).toBe((DEFAULT_DURATION_MINUTES + 90) * MINUTE)
  })

  it('uses the earliest available virtual courts for future matches', () => {
    const { db, tournamentId, roundId } = setupPlayoffTournament({ courtCount: 2 })

    autoSchedule(db, tournamentId)

    const matches = listRoundMatches(db, roundId)
    const bracketRounds = computeBracketRounds(matches)
    const byId = new Map(matches.map((m) => [m.id, m]))
    const semis = matchesByBracketRound(matches).get(2)!
    const dayStartMs = new Date('2026-04-14T09:00:00').getTime()
    const earliestCourtFreeMs = dayStartMs + 2 * DEFAULT_DURATION_MINUTES * MINUTE
    const earliestDependencyReadyMs = Math.min(
      ...semis.map((m) =>
        dependencyReadyMs(m, byId, bracketRounds, () => DEFAULT_DURATION_MINUTES, 30)
      )
    )

    expect(semis).toHaveLength(2)
    expect(earliestStart(semis)).toBe(Math.max(earliestCourtFreeMs, earliestDependencyReadyMs))
  })

  it('schedules ready playoff matches with higher categoryDepth before lower categoryDepth', () => {
    const { db, tournamentId, roundId } = setupPlayoffTournament({ courtCount: 1 })
    const matches = listRoundMatches(db, roundId)
    const byRound = matchesByBracketRound(matches)
    const firstRoundMatches = byRound.get(1)!
    const semi = byRound.get(2)![0]

    db.update(schema.matches)
      .set({
        team1_id: firstRoundMatches[0].team1_id,
        team2_id: firstRoundMatches[1].team1_id,
        status: 'ready'
      })
      .where(eq(schema.matches.id, semi.id))
      .run()

    autoSchedule(db, tournamentId)

    const updatedMatches = listRoundMatches(db, roundId)
    const updatedByRound = matchesByBracketRound(updatedMatches)
    const updatedFirstRoundMatches = updatedByRound.get(1)!
    const updatedSemi = updatedMatches.find((m) => m.id === semi.id)!

    expect(Math.max(...updatedFirstRoundMatches.map((m) => startMs(m.scheduled_at)))).toBeLessThan(
      startMs(updatedSemi.scheduled_at)
    )
  })

  it('does not idle when another virtual court is free earlier', () => {
    const { db, tournamentId, roundId } = setupPlayoffTournament({ courtCount: 2, teamCount: 5 })

    autoSchedule(db, tournamentId)

    const matches = listRoundMatches(db, roundId)
    const semis = matchesByBracketRound(matches).get(2)!
    const dayStartMs = new Date('2026-04-14T09:00:00').getTime()

    expect(semis).toHaveLength(2)
    expect(earliestStart(semis)).toBe(dayStartMs)
  })

  it('continues the preliminary bracket timeline after round-robin and ready playoff phases', () => {
    const restMinutes = 30
    const { db, tournamentId, roundId } = setupPlayoffTournament({
      courtCount: 1,
      teamCount: 4,
      restMinutes
    })
    const rrEvent = new EventRepository(db).create({
      tournament_id: tournamentId,
      name: 'Round Robin Warmup',
      category: 'WS'
    })
    const rrRound = new RoundRepository(db).create({
      event_id: rrEvent.id,
      name: 'Warmup Group',
      type: 'round_robin'
    })
    const playerA = new PlayerRepository(db).create({ first_name: 'RR', last_name: 'A', gender: 'F' })
    const playerB = new PlayerRepository(db).create({ first_name: 'RR', last_name: 'B', gender: 'F' })
    const teamA = new TeamRepository(db).create({ name: 'RR A', category: 'WS', player_ids: [playerA.id] })
    const teamB = new TeamRepository(db).create({ name: 'RR B', category: 'WS', player_ids: [playerB.id] })

    db.insert(schema.matches)
      .values({
        id: 'rr-warmup',
        round_id: rrRound.id,
        team1_id: teamA.id,
        team2_id: teamB.id,
        status: 'ready',
        tour: 1
      })
      .run()

    autoSchedule(db, tournamentId)

    const matches = listRoundMatches(db, roundId)
    const final = finalMatch(matches)
    const firstRound = matchesByBracketRound(matches).get(1)!
    const expectedFinalStart =
      latestStart(firstRound) + (DEFAULT_DURATION_MINUTES + restMinutes) * MINUTE

    expect(startMs(final.scheduled_at)).toBe(expectedFinalStart)
  })

  it('orders future matches at the same bracket level by earliest dependency availability', () => {
    const db = createTestDb()
    const tournament = new TournamentRepository(db).create({
      name: 'Multi Category Cup',
      date_start: '2026-04-14',
      date_end: '2026-04-14',
      status: 'in_progress'
    })
    db.update(schema.tournaments)
      .set({ rest_minutes: 30 })
      .where(eq(schema.tournaments.id, tournament.id))
      .run()
    for (let i = 1; i <= 2; i++) {
      db.insert(schema.courts)
        .values({ id: `multi-court-${i}`, tournament_id: tournament.id, name: `Court ${i}` })
        .run()
    }

    const earlyRoundId = addPlayoffRound(db, tournament.id, 'MS', 'Early', 4)
    const lateRoundId = addPlayoffRound(db, tournament.id, 'WS', 'Late', 4)
    for (const match of matchesByBracketRound(listRoundMatches(db, lateRoundId)).get(1)!) {
      db.update(schema.matches)
        .set({ not_before_hard: '2026-04-14T12:00:00' })
        .where(eq(schema.matches.id, match.id))
        .run()
    }

    autoSchedule(db, tournament.id)

    const earlyFinal = finalMatch(listRoundMatches(db, earlyRoundId))
    const lateFinal = finalMatch(listRoundMatches(db, lateRoundId))

    expect(startMs(earlyFinal.scheduled_at)).toBeLessThan(startMs(lateFinal.scheduled_at))
  })

  it('does not use matches from another playoff round as bracket dependencies', () => {
    const db = createTestDb()
    const tournament = new TournamentRepository(db).create({
      name: 'Isolated Brackets Cup',
      date_start: '2026-04-14',
      date_end: '2026-04-14',
      status: 'in_progress'
    })
    db.update(schema.tournaments)
      .set({ rest_minutes: 30 })
      .where(eq(schema.tournaments.id, tournament.id))
      .run()
    for (let i = 1; i <= 4; i++) {
      db.insert(schema.courts)
        .values({ id: `isolated-court-${i}`, tournament_id: tournament.id, name: `Court ${i}` })
        .run()
    }

    const roundAId = addPlayoffRound(db, tournament.id, 'MS', 'A', 4)
    addPlayoffRound(db, tournament.id, 'WS', 'B', 4)

    autoSchedule(db, tournament.id)

    const matchesA = listRoundMatches(db, roundAId)
    const bracketRoundsA = computeBracketRounds(matchesA)
    const byIdA = new Map(matchesA.map((m) => [m.id, m]))
    const finalA = finalMatch(matchesA)
    const ownDependencyReadyMs = dependencyReadyMs(
      finalA,
      byIdA,
      bracketRoundsA,
      () => DEFAULT_DURATION_MINUTES,
      30
    )

    expect(startMs(finalA.scheduled_at)).toBe(ownDependencyReadyMs)
  })

  it('handles a tournament with no preliminary playoff matches', () => {
    const { db, tournamentId, roundId } = setupPlayoffTournament({ teamCount: 2 })

    expect(() => autoSchedule(db, tournamentId)).not.toThrow()

    const matches = listRoundMatches(db, roundId)
    expect(matches).toHaveLength(1)
    expect(matches[0].status).toBe('ready')
    expect(matches[0].scheduled_at).not.toBeNull()
  })

  it('does nothing when the tournament has no courts', () => {
    const { db, tournamentId, roundId } = setupPlayoffTournament({ courtCount: 0 })

    expect(() => autoSchedule(db, tournamentId)).not.toThrow()

    const matches = listRoundMatches(db, roundId)
    expect(matches.every((m) => m.scheduled_at === null)).toBe(true)
  })

  it('handles an incomplete bracket tree by using the available child dependency', () => {
    const restMinutes = 30
    const { db, tournamentId, roundId } = setupPlayoffTournament({ restMinutes })
    const final = finalMatch(listRoundMatches(db, roundId))

    db.update(schema.matches)
      .set({ right_match_id: null })
      .where(eq(schema.matches.id, final.id))
      .run()

    autoSchedule(db, tournamentId)

    const matches = listRoundMatches(db, roundId)
    const updatedFinal = finalMatch(matches)
    const bracketRounds = computeBracketRounds(matches)
    const byId = new Map(matches.map((m) => [m.id, m]))

    expect(startMs(updatedFinal.scheduled_at)).toBe(
      dependencyReadyMs(
        updatedFinal,
        byId,
        bracketRounds,
        () => DEFAULT_DURATION_MINUTES,
        restMinutes
      )
    )
  })

  it('is idempotent for unchanged unfinished matches', () => {
    const { db, tournamentId, roundId } = setupPlayoffTournament()

    autoSchedule(db, tournamentId)
    const firstRun = new Map(
      listRoundMatches(db, roundId).map((m) => [m.id, { scheduledAt: m.scheduled_at, courtId: m.court_id }])
    )

    autoSchedule(db, tournamentId)
    const secondRun = new Map(
      listRoundMatches(db, roundId).map((m) => [m.id, { scheduledAt: m.scheduled_at, courtId: m.court_id }])
    )

    expect(secondRun).toEqual(firstRun)
  })

  it('carries ready-match not_before_hard delays into preliminary playoff scheduling', () => {
    const restMinutes = 30
    const { db, tournamentId, roundId } = setupPlayoffTournament({ courtCount: 1, restMinutes })
    const firstReady = matchesByBracketRound(listRoundMatches(db, roundId)).get(1)![0]
    const hardStart = '2026-04-14T12:00:00'

    db.update(schema.matches)
      .set({ not_before_hard: hardStart })
      .where(eq(schema.matches.id, firstReady.id))
      .run()

    autoSchedule(db, tournamentId)

    const matches = listRoundMatches(db, roundId)
    const updatedFirstReady = matches.find((m) => m.id === firstReady.id)!
    const final = finalMatch(matches)

    expect(updatedFirstReady.scheduled_at).toBe(hardStart)
    expect(startMs(final.scheduled_at)).toBeGreaterThan(startMs(hardStart))
  })

  it('schedules higher-categoryDepth rounds before lower-categoryDepth rounds across all categories', () => {
    // Replicates a real tournament structure:
    //   MS 50 teams → 64-slot bracket → max_br=6
    //   WS 40 teams → 64-slot bracket → max_br=6
    //   XD 40 teams → 64-slot bracket → max_br=6
    //   MD 26 teams → 32-slot bracket → max_br=5
    //   WD 20 teams → 32-slot bracket → max_br=5
    // categoryDepth = maxBracketRound - codeBracketRound + 1
    //   MS/WS/XD R1: depth=6, R2: depth=5
    //   MD/WD   R1: depth=5, R2: depth=4
    // Assertion: no group with lower categoryDepth starts before any group with higher categoryDepth.
    const db = createTestDb()
    const tournament = new TournamentRepository(db).create({
      name: 'Spring Cup Test',
      date_start: '2026-04-24',
      date_end: '2026-04-26',
      status: 'in_progress'
    })
    db.update(schema.tournaments)
      .set({ rest_minutes: 30 })
      .where(eq(schema.tournaments.id, tournament.id))
      .run()

    for (let i = 1; i <= 4; i++) {
      db.insert(schema.courts)
        .values({ id: `sc-court-${i}`, tournament_id: tournament.id, name: `Court ${i}` })
        .run()
    }
    for (let br = 1; br <= 5; br++) {
      addStageDuration(db, tournament.id, br, 30)
    }

    const roundIds = {
      MS: addPlayoffRound(db, tournament.id, 'MS', 'MS', 50),
      WS: addPlayoffRound(db, tournament.id, 'WS', 'WS', 40),
      XD: addPlayoffRound(db, tournament.id, 'XD', 'XD', 40),
      MD: addPlayoffRound(db, tournament.id, 'MD', 'MD', 26),
      WD: addPlayoffRound(db, tournament.id, 'WD', 'WD', 20)
    }

    autoSchedule(db, tournament.id)

    // Collect (categoryDepth, minStart, maxStart) for each non-walkover scheduled group
    // within each (category × bracketRound) cell.
    type GroupInfo = { label: string; categoryDepth: number; minStart: number; maxStart: number }
    const groups: GroupInfo[] = []

    for (const [cat, roundId] of Object.entries(roundIds)) {
      const allMatches = listRoundMatches(db, roundId)
      const scheduled = allMatches.filter(
        (m) => m.scheduled_at !== null && m.status !== 'walkover'
      )
      if (scheduled.length === 0) continue

      const bracketRounds = computeBracketRounds(allMatches)
      const maxBr = Math.max(...[...bracketRounds.values()])
      const byBr = matchesByBracketRound(scheduled)

      for (const [br, brMatches] of byBr) {
        const categoryDepth = maxBr - br + 1
        const starts = brMatches.map((m) => startMs(m.scheduled_at))
        groups.push({
          label: `${cat} br=${br} depth=${categoryDepth}`,
          categoryDepth,
          minStart: Math.min(...starts),
          maxStart: Math.max(...starts)
        })
      }
    }

    // For every pair of groups A (higher depth) and B (lower depth):
    // ALL matches in A must start before ANY match in B starts.
    // i.e. maxStart(A) ≤ minStart(B)
    for (const groupA of groups) {
      for (const groupB of groups) {
        if (groupA.categoryDepth > groupB.categoryDepth) {
          expect(groupA.maxStart).toBeLessThanOrEqual(groupB.minStart)
        }
      }
    }
  })

  it('schedules each category as a contiguous block in early bracket rounds (R32, R64)', () => {
    // For early rounds (maxBracketRound - bracketRound >= 4), matches of the same category
    // should form a non-overlapping time block: no other category's matches appear between
    // the first and last match of category A at the same bracketRound level.
    // i.e. for every pair of categories A and C at the same early bracketRound:
    //   maxStart(A) ≤ minStart(C)  OR  maxStart(C) ≤ minStart(A)
    const db = createTestDb()
    const tournament = new TournamentRepository(db).create({
      name: 'Continuity Cup',
      date_start: '2026-04-24',
      date_end: '2026-04-26',
      status: 'in_progress'
    })
    db.update(schema.tournaments)
      .set({ rest_minutes: 30 })
      .where(eq(schema.tournaments.id, tournament.id))
      .run()

    for (let i = 1; i <= 4; i++) {
      db.insert(schema.courts)
        .values({ id: `cc-court-${i}`, tournament_id: tournament.id, name: `Court ${i}` })
        .run()
    }
    for (let br = 1; br <= 5; br++) {
      addStageDuration(db, tournament.id, br, 30)
    }

    const roundIds = {
      MS: addPlayoffRound(db, tournament.id, 'MS', 'MS', 50),
      WS: addPlayoffRound(db, tournament.id, 'WS', 'WS', 40),
      XD: addPlayoffRound(db, tournament.id, 'XD', 'XD', 40),
      MD: addPlayoffRound(db, tournament.id, 'MD', 'MD', 26),
      WD: addPlayoffRound(db, tournament.id, 'WD', 'WD', 20)
    }

    autoSchedule(db, tournament.id)

    // Collect (category, bracketRound, minStart, maxStart) for early rounds only.
    // Early round: maxBracketRound - codeBracketRound >= 4
    type Block = { label: string; minStart: number; maxStart: number }
    // key: bracketRound → list of per-category blocks at that level
    const blocksByLevel = new Map<number, Block[]>()

    for (const [cat, roundId] of Object.entries(roundIds)) {
      const allMatches = listRoundMatches(db, roundId)
      const scheduled = allMatches.filter(
        (m) => m.scheduled_at !== null && m.status !== 'walkover'
      )
      if (scheduled.length === 0) continue

      const bracketRounds = computeBracketRounds(allMatches)
      const maxBr = Math.max(...[...bracketRounds.values()])
      const byBr = matchesByBracketRound(scheduled)

      for (const [br, brMatches] of byBr) {
        // Only check early rounds
        if (maxBr - br < 4) continue
        const starts = brMatches.map((m) => startMs(m.scheduled_at))
        const block: Block = {
          label: `${cat} br=${br}`,
          minStart: Math.min(...starts),
          maxStart: Math.max(...starts)
        }
        if (!blocksByLevel.has(br)) blocksByLevel.set(br, [])
        blocksByLevel.get(br)!.push(block)
      }
    }

    // For every bracketRound level, every pair of category blocks must be non-overlapping:
    // one block fully precedes the other.
    for (const [_br, blocks] of blocksByLevel) {
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          const a = blocks[i]
          const b = blocks[j]
          const nonOverlapping =
            a.maxStart <= b.minStart || b.maxStart <= a.minStart
          expect(nonOverlapping, `${a.label} and ${b.label} overlap`).toBe(true)
        }
      }
    }
  })
})
