import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../db/test-helpers'
import { buildSnapshot } from './export.service'
import { TournamentRepository } from '../db/repositories/tournament.repo'
import { VenueRepository } from '../db/repositories/venue.repo'
import { CourtRepository } from '../db/repositories/court.repo'
import { EventRepository } from '../db/repositories/event.repo'
import { PlayerRepository } from '../db/repositories/player.repo'
import { TeamRepository } from '../db/repositories/team.repo'
import { RoundRepository } from '../db/repositories/round.repo'
import { RoundTeamRepository } from '../db/repositories/round-team.repo'
import { MatchRepository } from '../db/repositories/match.repo'
import { TournamentPlayerRepository } from '../db/repositories/tournament-player.repo'
import { generateMatches } from './round-robin.service'
import { generateBracket } from './playoff.service'
import * as schema from '../db/schema'

// ─── Fixture ──────────────────────────────────────────────────────────────────
//
// Tournament "Test Cup" with:
//   - venue "Sports Hall" at "123 Main St"
//   - 2 courts: "Court A", "Court B"
//   - 4 players: alice (accepted), bob (accepted), carol (pending), dave (rejected)
//   - event "Women's Singles" (WS)
//     - round_robin "Group A": alice vs bob, 1 finished match (21-15, 21-10)
//     - playoff "Knockout": 4 teams, full 4-team bracket

function buildFixture() {
  const db = createTestDb()

  const tournamentRepo = new TournamentRepository(db)
  const venueRepo = new VenueRepository(db)
  const courtRepo = new CourtRepository(db)
  const eventRepo = new EventRepository(db)
  const playerRepo = new PlayerRepository(db)
  const teamRepo = new TeamRepository(db)
  const roundRepo = new RoundRepository(db)
  const roundTeamRepo = new RoundTeamRepository(db)
  const matchRepo = new MatchRepository(db)
  const tpRepo = new TournamentPlayerRepository(db)

  const venue = venueRepo.create({ name: 'Sports Hall', address: '123 Main St' })
  const tournament = tournamentRepo.create({
    name: 'Test Cup',
    date_start: '2025-06-01',
    date_end: '2025-06-02',
    venue_id: venue.id,
    status: 'in_progress',
  })

  const courtA = courtRepo.create({ tournament_id: tournament.id, name: 'Court A' })
  const courtB = courtRepo.create({ tournament_id: tournament.id, name: 'Court B' })

  const alice = playerRepo.create({ first_name: 'Alice', last_name: 'Smith', gender: 'F', birth_year: 2000 })
  const bob   = playerRepo.create({ first_name: 'Bob',   last_name: 'Jones', gender: 'M', birth_year: 1995 })
  const carol = playerRepo.create({ first_name: 'Carol', last_name: 'Pending' })
  const dave  = playerRepo.create({ first_name: 'Dave',  last_name: 'Rejected' })

  const tpAlice = tpRepo.register(tournament.id, alice.id)
  tpRepo.updateStatus(tpAlice.id, 'accepted')
  const tpBob = tpRepo.register(tournament.id, bob.id)
  tpRepo.updateStatus(tpBob.id, 'accepted')
  tpRepo.register(tournament.id, carol.id) // stays pending
  const tpDave = tpRepo.register(tournament.id, dave.id)
  tpRepo.updateStatus(tpDave.id, 'rejected')

  const teamAlice = teamRepo.create({ name: 'Alice Smith', category: 'WS', player_ids: [alice.id] })
  const teamBob   = teamRepo.create({ name: 'Bob Jones',   category: 'WS', player_ids: [bob.id]   })

  const event = eventRepo.create({ tournament_id: tournament.id, name: "Women's Singles", category: 'WS' })

  // Round-robin round: alice vs bob, finished with sets
  const rrRound = roundRepo.create({ event_id: event.id, name: 'Group A', type: 'round_robin' })
  roundTeamRepo.add(rrRound.id, teamAlice.id)
  roundTeamRepo.add(rrRound.id, teamBob.id)
  const rrMatches = generateMatches(db, rrRound.id)
  const rrMatch = matchRepo.updateResult(rrMatches[0].id, {
    status: 'finished',
    sets: [{ s1: 21, s2: 15 }, { s1: 21, s2: 10 }],
  })

  // Playoff round: 4 seeded teams → 3 matches with bracket links
  const poRound = roundRepo.create({ event_id: event.id, name: 'Knockout', type: 'playoff' })
  const poTeams = ['T1', 'T2', 'T3', 'T4'].map((name, i) => {
    const pid = playerRepo.create({ first_name: 'P', last_name: name }).id
    const team = teamRepo.create({ name, category: 'MS', player_ids: [pid] })
    const rt = roundTeamRepo.add(poRound.id, team.id)
    db.update(schema.round_teams).set({ seed: i + 1 }).where(eq(schema.round_teams.id, rt.id)).run()
    return team
  })
  generateBracket(db, poRound.id)

  return { db, tournament, venue, courtA, courtB, alice, bob, carol, dave, teamAlice, teamBob, event, rrRound, rrMatch, poRound, poTeams }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildSnapshot', () => {

  it('throws for unknown tournament id', () => {
    const db = createTestDb()
    expect(() => buildSnapshot(db, 'no-such-id')).toThrow('Tournament not found')
  })

  it('exportedAt is a valid ISO timestamp', () => {
    const { db, tournament } = buildFixture()
    const snap = buildSnapshot(db, tournament.id)
    expect(new Date(snap.exportedAt).toISOString()).toBe(snap.exportedAt)
  })

  // ── Tournament fields ──────────────────────────────────────────────────────

  describe('tournament fields', () => {
    it('name, dates and status match the source', () => {
      const { db, tournament } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      expect(snap.tournament.id).toBe(tournament.id)
      expect(snap.tournament.name).toBe(tournament.name)
      expect(snap.tournament.date_start).toBe(tournament.date_start)
      expect(snap.tournament.date_end).toBe(tournament.date_end)
      expect(snap.tournament.status).toBe(tournament.status)
    })

    it('venue name and address are included', () => {
      const { db, tournament, venue } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      expect(snap.tournament.venue).not.toBeNull()
      expect(snap.tournament.venue!.name).toBe(venue.name)
      expect(snap.tournament.venue!.address).toBe(venue.address)
    })

    it('venue is null when tournament has no venue', () => {
      const db = createTestDb()
      const id = new TournamentRepository(db).create({ name: 'No Venue', date_start: '2025-06-01', date_end: '2025-06-01' }).id
      expect(buildSnapshot(db, id).tournament.venue).toBeNull()
    })

    it('does not expose internal fields (created_at, updated_at, is_demo)', () => {
      const { db, tournament } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      expect(snap.tournament).not.toHaveProperty('created_at')
      expect(snap.tournament).not.toHaveProperty('updated_at')
      expect(snap.tournament).not.toHaveProperty('is_demo')
    })
  })

  // ── Courts ─────────────────────────────────────────────────────────────────

  describe('courts', () => {
    it('all courts for the tournament are present', () => {
      const { db, tournament, courtA, courtB } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      const ids = snap.courts.map((c) => c.id)
      expect(ids).toContain(courtA.id)
      expect(ids).toContain(courtB.id)
      expect(snap.courts).toHaveLength(2)
    })

    it('court id and name match the source', () => {
      const { db, tournament, courtA } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      const court = snap.courts.find((c) => c.id === courtA.id)!
      expect(court.name).toBe(courtA.name)
    })
  })

  // ── Players ────────────────────────────────────────────────────────────────

  describe('players', () => {
    it('includes only accepted players (not pending or rejected)', () => {
      const { db, tournament, alice, bob } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      const ids = snap.players.map((p) => p.id)
      expect(ids).toContain(alice.id)
      expect(ids).toContain(bob.id)
      expect(snap.players).toHaveLength(2)
    })

    it('does not expose birth_year', () => {
      const { db, tournament } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      for (const p of snap.players) {
        expect(p).not.toHaveProperty('birth_year')
      }
    })

    it('does not expose gender', () => {
      const { db, tournament } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      for (const p of snap.players) {
        expect(p).not.toHaveProperty('gender')
      }
    })

    it('player fields match the source', () => {
      const { db, tournament, alice } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      const p = snap.players.find((p) => p.id === alice.id)!
      expect(p.first_name).toBe(alice.first_name)
      expect(p.last_name).toBe(alice.last_name)
      expect(p.club).toBe(alice.club)
    })
  })

  // ── Events ─────────────────────────────────────────────────────────────────

  describe('events', () => {
    it('event is present with correct fields', () => {
      const { db, tournament, event } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      const e = snap.events.find((e) => e.id === event.id)!
      expect(e.name).toBe(event.name)
      expect(e.category).toBe(event.category)
    })

    it('both rounds appear inside the event', () => {
      const { db, tournament, rrRound, poRound } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      const roundIds = snap.events[0].rounds.map((r) => r.id)
      expect(roundIds).toContain(rrRound.id)
      expect(roundIds).toContain(poRound.id)
    })
  })

  // ── Round-robin round ──────────────────────────────────────────────────────

  describe('round_robin round', () => {
    function getRrRound(db: ReturnType<typeof createTestDb>, tournamentId: string, rrRoundId: string) {
      return buildSnapshot(db, tournamentId).events[0].rounds.find((r) => r.id === rrRoundId)!
    }

    it('type is round_robin', () => {
      const { db, tournament, rrRound } = buildFixture()
      expect(getRrRound(db, tournament.id, rrRound.id).type).toBe('round_robin')
    })

    it('standings is defined', () => {
      const { db, tournament, rrRound } = buildFixture()
      expect(getRrRound(db, tournament.id, rrRound.id).standings).toBeDefined()
    })

    it('standings contains an entry for each team in the round', () => {
      const { db, tournament, rrRound, teamAlice, teamBob } = buildFixture()
      const standings = getRrRound(db, tournament.id, rrRound.id).standings!
      const teamIds = standings.map((s) => s.team_id)
      expect(teamIds).toContain(teamAlice.id)
      expect(teamIds).toContain(teamBob.id)
    })

    it('teams are present with player_ids', () => {
      const { db, tournament, rrRound, teamAlice, teamBob, alice, bob } = buildFixture()
      const round = getRrRound(db, tournament.id, rrRound.id)
      const snapAlice = round.teams.find((t) => t.id === teamAlice.id)!
      const snapBob   = round.teams.find((t) => t.id === teamBob.id)!
      expect(snapAlice.player_ids).toContain(alice.id)
      expect(snapBob.player_ids).toContain(bob.id)
    })

    it('match references both teams', () => {
      const { db, tournament, rrRound, rrMatch, teamAlice, teamBob } = buildFixture()
      const round = getRrRound(db, tournament.id, rrRound.id)
      const match = round.matches.find((m) => m.id === rrMatch.id)!
      expect([match.team1_id, match.team2_id]).toContain(teamAlice.id)
      expect([match.team1_id, match.team2_id]).toContain(teamBob.id)
    })

    it('finished match has status finished and a winner', () => {
      const { db, tournament, rrRound, rrMatch } = buildFixture()
      const round = getRrRound(db, tournament.id, rrRound.id)
      const match = round.matches.find((m) => m.id === rrMatch.id)!
      expect(match.status).toBe('finished')
      expect(match.winner_id).not.toBeNull()
    })
  })

  // ── Match sets ─────────────────────────────────────────────────────────────

  describe('match sets', () => {
    it('sets are attached to the correct match', () => {
      const { db, tournament, rrRound, rrMatch } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      const round = snap.events[0].rounds.find((r) => r.id === rrRound.id)!
      const match = round.matches.find((m) => m.id === rrMatch.id)!
      expect(match.sets).toHaveLength(2)
    })

    it('set scores match the recorded result', () => {
      const { db, tournament, rrRound, rrMatch } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      const round = snap.events[0].rounds.find((r) => r.id === rrRound.id)!
      const match = round.matches.find((m) => m.id === rrMatch.id)!
      expect(match.sets[0]).toEqual({ s1: 21, s2: 15 })
      expect(match.sets[1]).toEqual({ s1: 21, s2: 10 })
    })

    it('unplayed matches have empty sets array', () => {
      const { db, tournament, poRound } = buildFixture()
      const snap = buildSnapshot(db, tournament.id)
      const round = snap.events[0].rounds.find((r) => r.id === poRound.id)!
      for (const match of round.matches) {
        expect(match.sets).toHaveLength(0)
      }
    })
  })

  // ── Playoff round ──────────────────────────────────────────────────────────

  describe('playoff round', () => {
    function getPoRound(db: ReturnType<typeof createTestDb>, tournamentId: string, poRoundId: string) {
      return buildSnapshot(db, tournamentId).events[0].rounds.find((r) => r.id === poRoundId)!
    }

    it('type is playoff', () => {
      const { db, tournament, poRound } = buildFixture()
      expect(getPoRound(db, tournament.id, poRound.id).type).toBe('playoff')
    })

    it('standings is undefined', () => {
      const { db, tournament, poRound } = buildFixture()
      expect(getPoRound(db, tournament.id, poRound.id).standings).toBeUndefined()
    })

    it('all 4 teams are present', () => {
      const { db, tournament, poRound, poTeams } = buildFixture()
      const round = getPoRound(db, tournament.id, poRound.id)
      const teamIds = round.teams.map((t) => t.id)
      for (const team of poTeams) {
        expect(teamIds).toContain(team.id)
      }
    })

    it('final match has left_match_id and right_match_id set', () => {
      const { db, tournament, poRound } = buildFixture()
      const round = getPoRound(db, tournament.id, poRound.id)
      const final = round.matches.find((m) => m.win_match_id === null)!
      expect(final.left_match_id).not.toBeNull()
      expect(final.right_match_id).not.toBeNull()
    })

    it('semi-final matches have win_match_id pointing to the final', () => {
      const { db, tournament, poRound } = buildFixture()
      const round = getPoRound(db, tournament.id, poRound.id)
      const final = round.matches.find((m) => m.win_match_id === null)!
      const semis = round.matches.filter((m) => m.win_match_id === final.id)
      expect(semis).toHaveLength(2)
    })

    it('semi-final ids match the final left_match_id and right_match_id', () => {
      const { db, tournament, poRound } = buildFixture()
      const round = getPoRound(db, tournament.id, poRound.id)
      const final = round.matches.find((m) => m.win_match_id === null)!
      const semiIds = round.matches.filter((m) => m.win_match_id === final.id).map((m) => m.id)
      expect(semiIds).toContain(final.left_match_id)
      expect(semiIds).toContain(final.right_match_id)
    })
  })
})
