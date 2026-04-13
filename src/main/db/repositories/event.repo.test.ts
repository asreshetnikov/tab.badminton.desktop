import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test-helpers'
import { TournamentRepository } from './tournament.repo'
import { EventRepository } from './event.repo'

describe('EventRepository', () => {
  let events: EventRepository
  let tournamentId: string

  beforeEach(() => {
    const db = createTestDb()
    const tournaments = new TournamentRepository(db)
    events = new EventRepository(db)
    tournamentId = tournaments.create({
      name: 'Test Tournament',
      date_start: '2025-06-01',
      date_end: '2025-06-02'
    }).id
  })

  it('creates an event', () => {
    const event = events.create({ tournament_id: tournamentId, name: "Men's Singles", category: 'MS' })
    expect(event.id).toBeDefined()
    expect(event.name).toBe("Men's Singles")
    expect(event.category).toBe('MS')
    expect(event.max_entries).toBeNull()
    expect(event.tournament_id).toBe(tournamentId)
  })

  it('creates an event with max_entries', () => {
    const event = events.create({
      tournament_id: tournamentId,
      name: 'Mixed Doubles',
      category: 'XD',
      max_entries: 16
    })
    expect(event.max_entries).toBe(16)
  })

  it('lists events by tournament', () => {
    events.create({ tournament_id: tournamentId, name: "Men's Singles", category: 'MS' })
    events.create({ tournament_id: tournamentId, name: "Women's Singles", category: 'WS' })
    expect(events.listByTournament(tournamentId)).toHaveLength(2)
  })

  it('returns empty list for tournament with no events', () => {
    expect(events.listByTournament(tournamentId)).toHaveLength(0)
  })

  it('updates an event', () => {
    const event = events.create({ tournament_id: tournamentId, name: 'MS', category: 'MS' })
    const updated = events.update(event.id, { name: "Men's Singles", max_entries: 32 })
    expect(updated.name).toBe("Men's Singles")
    expect(updated.max_entries).toBe(32)
  })

  it('deletes an event', () => {
    const event = events.create({ tournament_id: tournamentId, name: 'MS', category: 'MS' })
    events.delete(event.id)
    expect(events.getById(event.id)).toBeUndefined()
  })
})
