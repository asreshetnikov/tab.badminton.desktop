import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../db/test-helpers'
import { assignSlot, validateConflicts } from './schedule.service'
import * as schema from '../db/schema'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupFixtures(db: ReturnType<typeof createTestDb>) {
  // Tournament + event + round
  db.insert(schema.tournaments)
    .values({
      id: 't1',
      name: 'Test Tournament',
      date_start: '2026-04-14',
      date_end: '2026-04-15',
      status: 'in_progress',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .run()

  db.insert(schema.events)
    .values({ id: 'e1', tournament_id: 't1', name: 'MS', category: 'MS' })
    .run()

  db.insert(schema.rounds)
    .values({ id: 'r1', event_id: 'e1', name: 'Group A', type: 'round_robin', order: 1 })
    .run()

  // Players
  db.insert(schema.players)
    .values([
      { id: 'pA', first_name: 'Alice', last_name: 'A', gender: 'F' },
      { id: 'pB', first_name: 'Bob', last_name: 'B', gender: 'M' },
      { id: 'pC', first_name: 'Carol', last_name: 'C', gender: 'F' }
    ])
    .run()

  // Singles team for Alice (WS)
  db.insert(schema.teams).values({ id: 'tA', name: 'Alice', category: 'WS' }).run()
  db.insert(schema.team_players).values({ id: 'tp1', team_id: 'tA', player_id: 'pA', position: 1 }).run()

  // Singles team for Bob (MS)
  db.insert(schema.teams).values({ id: 'tB', name: 'Bob', category: 'MS' }).run()
  db.insert(schema.team_players).values({ id: 'tp2', team_id: 'tB', player_id: 'pB', position: 1 }).run()

  // Doubles team Alice + Carol (WD) — Alice plays in two teams
  db.insert(schema.teams).values({ id: 'tAC', name: 'Alice/Carol', category: 'WD' }).run()
  db.insert(schema.team_players)
    .values([
      { id: 'tp3', team_id: 'tAC', player_id: 'pA', position: 1 },
      { id: 'tp4', team_id: 'tAC', player_id: 'pC', position: 2 }
    ])
    .run()

  // Match 1: Alice (tA) vs Bob (tB), scheduled at 10:00
  db.insert(schema.matches)
    .values({
      id: 'm1',
      round_id: 'r1',
      team1_id: 'tA',
      team2_id: 'tB',
      status: 'ready',
      scheduled_at: '2026-04-14T10:00:00'
    })
    .run()

  // Match 2: Alice/Carol (tAC) vs someone (no team2 yet), not scheduled
  db.insert(schema.matches)
    .values({
      id: 'm2',
      round_id: 'r1',
      team1_id: 'tAC',
      status: 'scheduled'
    })
    .run()

  // Match 3: unrelated teams (tB vs tAC), not yet scheduled
  db.insert(schema.matches)
    .values({
      id: 'm3',
      round_id: 'r1',
      team1_id: 'tB',
      team2_id: 'tAC',
      status: 'ready'
    })
    .run()
}

// ─── assignSlot tests ─────────────────────────────────────────────────────────

describe('assignSlot', () => {
  it('sets court_id and scheduled_at on a match', () => {
    const db = createTestDb()
    db.insert(schema.tournaments)
      .values({ id: 't1', name: 'T', date_start: '2026-04-14', date_end: '2026-04-14', status: 'draft', created_at: 'x', updated_at: 'x' })
      .run()
    db.insert(schema.events).values({ id: 'e1', tournament_id: 't1', name: 'MS', category: 'MS' }).run()
    db.insert(schema.rounds).values({ id: 'r1', event_id: 'e1', name: 'R1', type: 'round_robin', order: 1 }).run()
    db.insert(schema.matches).values({ id: 'm1', round_id: 'r1', status: 'scheduled' }).run()

    assignSlot(db, 'm1', { courtId: null, datetime: '2026-04-14T09:00:00' })

    const updated = db.select().from(schema.matches).where(eq(schema.matches.id, 'm1')).get()
    expect(updated?.scheduled_at).toBe('2026-04-14T09:00:00')
  })
})

// ─── validateConflicts tests ──────────────────────────────────────────────────

describe('validateConflicts', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    setupFixtures(db)
  })

  it('returns a conflict when a shared player has an overlapping match', () => {
    // Alice/Carol (tAC) wants to play at 10:30 for 60 min
    // Alice is already in match m1 at 10:00 for 60 min → overlap at [10:00,11:00) ∩ [10:30,11:30)
    const conflicts = validateConflicts(db, 'm2', {
      teamId: 'tAC',
      datetime: '2026-04-14T10:30:00',
      duration: 60
    })

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].matchId).toBe('m1')
  })

  it('returns no conflict when the slot does not overlap', () => {
    // Alice/Carol wants to play at 11:00 — m1 ends at 10:00+60=11:00, no overlap
    const conflicts = validateConflicts(db, 'm2', {
      teamId: 'tAC',
      datetime: '2026-04-14T11:00:00',
      duration: 60
    })

    expect(conflicts).toHaveLength(0)
  })

  it('returns no conflict when no players are shared with any scheduled match', () => {
    // Bob (tB) wants to play in m3 at 12:00; m1 involves Bob at 10:00 but no overlap
    const conflicts = validateConflicts(db, 'm3', {
      teamId: 'tB',
      datetime: '2026-04-14T12:00:00',
      duration: 60
    })

    expect(conflicts).toHaveLength(0)
  })

  it('excludes the match being scheduled from conflict results', () => {
    // Assign m1 a slot, then re-check m1 itself — should not appear as its own conflict
    const conflicts = validateConflicts(db, 'm1', {
      teamId: 'tA',
      datetime: '2026-04-14T10:00:00',
      duration: 60
    })

    expect(conflicts.every((c) => c.matchId !== 'm1')).toBe(true)
  })

  it('returns conflict at the exact same start time', () => {
    const conflicts = validateConflicts(db, 'm2', {
      teamId: 'tAC',
      datetime: '2026-04-14T10:00:00',
      duration: 60
    })

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].matchId).toBe('m1')
  })

  it('returns empty array when team has no players', () => {
    db.insert(schema.teams).values({ id: 'empty', name: 'Empty', category: 'MS' }).run()
    db.insert(schema.matches).values({ id: 'mx', round_id: 'r1', team1_id: 'empty', status: 'scheduled' }).run()

    const conflicts = validateConflicts(db, 'mx', {
      teamId: 'empty',
      datetime: '2026-04-14T10:00:00',
      duration: 60
    })

    expect(conflicts).toHaveLength(0)
  })
})
