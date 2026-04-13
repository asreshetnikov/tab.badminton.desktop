import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test-helpers'
import { TournamentRepository } from './tournament.repo'
import { CourtRepository } from './court.repo'

describe('CourtRepository', () => {
  let courts: CourtRepository
  let tournamentId: string

  beforeEach(() => {
    const db = createTestDb()
    const tournaments = new TournamentRepository(db)
    courts = new CourtRepository(db)
    tournamentId = tournaments.create({
      name: 'Test Tournament',
      date_start: '2025-06-01',
      date_end: '2025-06-02'
    }).id
  })

  it('creates a court', () => {
    const court = courts.create({ tournament_id: tournamentId, name: 'Court 1' })
    expect(court.id).toBeDefined()
    expect(court.name).toBe('Court 1')
    expect(court.tournament_id).toBe(tournamentId)
  })

  it('lists courts by tournament', () => {
    courts.create({ tournament_id: tournamentId, name: 'Court 1' })
    courts.create({ tournament_id: tournamentId, name: 'Court 2' })
    const list = courts.listByTournament(tournamentId)
    expect(list).toHaveLength(2)
  })

  it('returns empty list for tournament with no courts', () => {
    expect(courts.listByTournament(tournamentId)).toHaveLength(0)
  })

  it('updates a court name', () => {
    const court = courts.create({ tournament_id: tournamentId, name: 'Court 1' })
    const updated = courts.update(court.id, { name: 'Main Court' })
    expect(updated.name).toBe('Main Court')
  })

  it('deletes a court', () => {
    const court = courts.create({ tournament_id: tournamentId, name: 'Court 1' })
    courts.delete(court.id)
    expect(courts.getById(court.id)).toBeUndefined()
  })
})
