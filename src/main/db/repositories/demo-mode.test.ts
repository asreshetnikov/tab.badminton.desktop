import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test-helpers'
import { TournamentRepository } from './tournament.repo'
import { PlayerRepository } from './player.repo'
import { TeamRepository } from './team.repo'
import { VenueRepository } from './venue.repo'
import { ensureSinglesTeamOnAccept } from '../../services/auto-team.service'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../schema'

type DB = BetterSQLite3Database<typeof schema>

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function seedTournaments(db: DB) {
  const repo = new TournamentRepository(db)
  const real = repo.create({ name: 'Real Open', date_start: '2026-06-01', date_end: '2026-06-02' }, false)
  const demo = repo.create({ name: 'Demo Open', date_start: '2026-07-01', date_end: '2026-07-02' }, true)
  return { real, demo }
}

function seedPlayers(db: DB) {
  const repo = new PlayerRepository(db)
  const real = repo.create({ first_name: 'Ivan', last_name: 'Real', gender: 'M' }, false)
  const demo = repo.create({ first_name: 'Demo', last_name: 'Player', gender: 'F' }, true)
  return { real, demo }
}

function seedTeams(db: DB) {
  const repo = new PlayerRepository(db)
  const p1 = repo.create({ first_name: 'A', last_name: 'Real', gender: 'M' }, false)
  const p2 = repo.create({ first_name: 'B', last_name: 'Demo', gender: 'M' }, true)

  const teamRepo = new TeamRepository(db)
  const real = teamRepo.create({ name: 'Team Real', category: 'MS', player_ids: [p1.id] }, false)
  const demo = teamRepo.create({ name: 'Team Demo', category: 'MS', player_ids: [p2.id] }, true)
  return { real, demo }
}

function seedVenues(db: DB) {
  const repo = new VenueRepository(db)
  const real = repo.create({ name: 'Sports Hall' }, false)
  const demo = repo.create({ name: 'Demo Arena' }, true)
  return { real, demo }
}

// ─── Tournament ───────────────────────────────────────────────────────────────

describe('TournamentRepository demo isolation', () => {
  let db: DB

  beforeEach(() => {
    db = createTestDb()
  })

  it('create sets is_demo=false by default', () => {
    const { real } = seedTournaments(db)
    expect(real.is_demo).toBe(false)
  })

  it('create sets is_demo=true in demo mode', () => {
    const { demo } = seedTournaments(db)
    expect(demo.is_demo).toBe(true)
  })

  it('list(false) returns only real tournaments', () => {
    seedTournaments(db)
    const result = new TournamentRepository(db).list(false)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Real Open')
  })

  it('list(true) returns only demo tournaments', () => {
    seedTournaments(db)
    const result = new TournamentRepository(db).list(true)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Demo Open')
  })

  it('demo tournaments are invisible in normal mode', () => {
    const repo = new TournamentRepository(db)
    repo.create({ name: 'Demo Only', date_start: '2026-01-01', date_end: '2026-01-02' }, true)
    expect(repo.list(false)).toHaveLength(0)
  })

  it('real tournaments are invisible in demo mode', () => {
    const repo = new TournamentRepository(db)
    repo.create({ name: 'Real Only', date_start: '2026-01-01', date_end: '2026-01-02' }, false)
    expect(repo.list(true)).toHaveLength(0)
  })
})

// ─── Player ───────────────────────────────────────────────────────────────────

describe('PlayerRepository demo isolation', () => {
  let db: DB

  beforeEach(() => {
    db = createTestDb()
  })

  it('create sets is_demo=false by default', () => {
    const { real } = seedPlayers(db)
    expect(real.is_demo).toBe(false)
  })

  it('create sets is_demo=true in demo mode', () => {
    const { demo } = seedPlayers(db)
    expect(demo.is_demo).toBe(true)
  })

  it('list(false) returns only real players', () => {
    seedPlayers(db)
    const result = new PlayerRepository(db).list(false)
    expect(result.every((p) => !p.is_demo)).toBe(true)
    expect(result.map((p) => p.last_name)).toContain('Real')
    expect(result.map((p) => p.last_name)).not.toContain('Player')
  })

  it('list(true) returns only demo players', () => {
    seedPlayers(db)
    const result = new PlayerRepository(db).list(true)
    expect(result.every((p) => p.is_demo)).toBe(true)
    expect(result.map((p) => p.last_name)).toContain('Player')
    expect(result.map((p) => p.last_name)).not.toContain('Real')
  })

  it('multiple real and demo players are correctly partitioned', () => {
    const repo = new PlayerRepository(db)
    for (let i = 0; i < 3; i++) repo.create({ first_name: `R${i}`, last_name: 'Real' }, false)
    for (let i = 0; i < 2; i++) repo.create({ first_name: `D${i}`, last_name: 'Demo' }, true)

    expect(repo.list(false)).toHaveLength(3)
    expect(repo.list(true)).toHaveLength(2)
  })
})

// ─── Team ─────────────────────────────────────────────────────────────────────

describe('TeamRepository demo isolation', () => {
  let db: DB

  beforeEach(() => {
    db = createTestDb()
  })

  it('create sets is_demo=false by default', () => {
    const { real } = seedTeams(db)
    expect(real.is_demo).toBe(false)
  })

  it('create sets is_demo=true in demo mode', () => {
    const { demo } = seedTeams(db)
    expect(demo.is_demo).toBe(true)
  })

  it('list(false) returns only real teams', () => {
    seedTeams(db)
    const result = new TeamRepository(db).list(false)
    expect(result.every((t) => !t.is_demo)).toBe(true)
    expect(result.map((t) => t.name)).toContain('Team Real')
    expect(result.map((t) => t.name)).not.toContain('Team Demo')
  })

  it('list(true) returns only demo teams', () => {
    seedTeams(db)
    const result = new TeamRepository(db).list(true)
    expect(result.every((t) => t.is_demo)).toBe(true)
    expect(result.map((t) => t.name)).toContain('Team Demo')
    expect(result.map((t) => t.name)).not.toContain('Team Real')
  })
})

// ─── Venue ────────────────────────────────────────────────────────────────────

describe('VenueRepository demo isolation', () => {
  let db: DB

  beforeEach(() => {
    db = createTestDb()
  })

  it('create sets is_demo=false by default', () => {
    const { real } = seedVenues(db)
    expect(real.is_demo).toBe(false)
  })

  it('create sets is_demo=true in demo mode', () => {
    const { demo } = seedVenues(db)
    expect(demo.is_demo).toBe(true)
  })

  it('list(false) returns only real venues', () => {
    seedVenues(db)
    const result = new VenueRepository(db).list(false)
    expect(result.map((v) => v.name)).toContain('Sports Hall')
    expect(result.map((v) => v.name)).not.toContain('Demo Arena')
  })

  it('list(true) returns only demo venues', () => {
    seedVenues(db)
    const result = new VenueRepository(db).list(true)
    expect(result.map((v) => v.name)).toContain('Demo Arena')
    expect(result.map((v) => v.name)).not.toContain('Sports Hall')
  })
})

// ─── ensureSinglesTeamOnAccept ────────────────────────────────────────────────

describe('ensureSinglesTeamOnAccept demo flag', () => {
  let db: DB

  beforeEach(() => {
    db = createTestDb()
  })

  it('auto-created team is real when isDemoMode=false', () => {
    const player = new PlayerRepository(db).create({ first_name: 'Ivan', last_name: 'Ivanov', gender: 'M' }, false)
    ensureSinglesTeamOnAccept(db, player.id, false)

    const teams = new TeamRepository(db).list(false)
    expect(teams.some((t) => t.players.some((p) => p.id === player.id))).toBe(true)

    const demoTeams = new TeamRepository(db).list(true)
    expect(demoTeams.some((t) => t.players.some((p) => p.id === player.id))).toBe(false)
  })

  it('auto-created team is demo when isDemoMode=true', () => {
    const player = new PlayerRepository(db).create({ first_name: 'Demo', last_name: 'User', gender: 'F' }, true)
    ensureSinglesTeamOnAccept(db, player.id, true)

    const demoTeams = new TeamRepository(db).list(true)
    expect(demoTeams.some((t) => t.players.some((p) => p.id === player.id))).toBe(true)

    const realTeams = new TeamRepository(db).list(false)
    expect(realTeams.some((t) => t.players.some((p) => p.id === player.id))).toBe(false)
  })

  it('does not create duplicate team on second call', () => {
    const player = new PlayerRepository(db).create({ first_name: 'Ivan', last_name: 'Test', gender: 'M' }, true)
    ensureSinglesTeamOnAccept(db, player.id, true)
    ensureSinglesTeamOnAccept(db, player.id, true)

    expect(new TeamRepository(db).list(true)).toHaveLength(1)
  })
})

// ─── Cross-contamination ──────────────────────────────────────────────────────

describe('cross-contamination: real and demo data never mix', () => {
  let db: DB

  beforeEach(() => {
    db = createTestDb()
  })

  it('switching mode reveals a completely separate dataset', () => {
    const tRepo = new TournamentRepository(db)
    const pRepo = new PlayerRepository(db)
    const teRepo = new TeamRepository(db)
    const vRepo = new VenueRepository(db)

    // Populate real data
    tRepo.create({ name: 'Real T', date_start: '2026-01-01', date_end: '2026-01-02' }, false)
    pRepo.create({ first_name: 'Real', last_name: 'P' }, false)
    const rp = pRepo.create({ first_name: 'Real2', last_name: 'P2', gender: 'M' }, false)
    teRepo.create({ name: 'Real Team', category: 'MS', player_ids: [rp.id] }, false)
    vRepo.create({ name: 'Real Venue' }, false)

    // Populate demo data
    tRepo.create({ name: 'Demo T', date_start: '2026-02-01', date_end: '2026-02-02' }, true)
    pRepo.create({ first_name: 'Demo', last_name: 'P' }, true)
    const dp = pRepo.create({ first_name: 'Demo2', last_name: 'P2', gender: 'F' }, true)
    teRepo.create({ name: 'Demo Team', category: 'WS', player_ids: [dp.id] }, true)
    vRepo.create({ name: 'Demo Venue' }, true)

    // Normal mode sees only real data
    expect(tRepo.list(false).map((t) => t.name)).toEqual(['Real T'])
    expect(pRepo.list(false).map((p) => p.last_name)).toEqual(expect.arrayContaining(['P', 'P2']))
    expect(teRepo.list(false).map((t) => t.name)).toEqual(['Real Team'])
    expect(vRepo.list(false).map((v) => v.name)).toEqual(['Real Venue'])

    // Demo mode sees only demo data
    expect(tRepo.list(true).map((t) => t.name)).toEqual(['Demo T'])
    expect(pRepo.list(true).map((p) => p.last_name)).toEqual(expect.arrayContaining(['P', 'P2']))
    expect(teRepo.list(true).map((t) => t.name)).toEqual(['Demo Team'])
    expect(vRepo.list(true).map((v) => v.name)).toEqual(['Demo Venue'])
  })
})
