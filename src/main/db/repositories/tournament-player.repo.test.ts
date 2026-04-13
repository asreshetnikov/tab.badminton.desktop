import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test-helpers'
import { TournamentRepository } from './tournament.repo'
import { PlayerRepository } from './player.repo'
import { TournamentPlayerRepository } from './tournament-player.repo'

describe('TournamentPlayerRepository', () => {
  let repo: TournamentPlayerRepository
  let tournamentId: string
  let playerId: string

  beforeEach(() => {
    const db = createTestDb()
    repo = new TournamentPlayerRepository(db)
    tournamentId = new TournamentRepository(db).create({
      name: 'Open 2025',
      date_start: '2025-06-01',
      date_end: '2025-06-02'
    }).id
    playerId = new PlayerRepository(db).create({ first_name: 'Ivan', last_name: 'Petrov' }).id
  })

  it('registers a player with pending status', () => {
    const reg = repo.register(tournamentId, playerId)
    expect(reg.id).toBeDefined()
    expect(reg.status).toBe('pending')
    expect(reg.player.last_name).toBe('Petrov')
    expect(reg.registered_at).toBeDefined()
  })

  it('lists registrations by tournament', () => {
    repo.register(tournamentId, playerId)
    expect(repo.listByTournament(tournamentId)).toHaveLength(1)
  })

  it('returns empty list when no registrations', () => {
    expect(repo.listByTournament(tournamentId)).toHaveLength(0)
  })

  it('updates status to accepted', () => {
    const reg = repo.register(tournamentId, playerId)
    const updated = repo.updateStatus(reg.id, 'accepted')
    expect(updated.status).toBe('accepted')
  })

  it('updates status to rejected', () => {
    const reg = repo.register(tournamentId, playerId)
    const updated = repo.updateStatus(reg.id, 'rejected')
    expect(updated.status).toBe('rejected')
  })

  it('removes a registration', () => {
    const reg = repo.register(tournamentId, playerId)
    repo.remove(reg.id)
    expect(repo.listByTournament(tournamentId)).toHaveLength(0)
  })
})
