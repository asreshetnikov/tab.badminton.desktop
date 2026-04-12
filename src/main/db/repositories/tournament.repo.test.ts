import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test-helpers'
import { TournamentRepository } from './tournament.repo'

describe('TournamentRepository', () => {
  let repo: TournamentRepository

  beforeEach(() => {
    repo = new TournamentRepository(createTestDb())
  })

  it('creates a tournament with default draft status', () => {
    const t = repo.create({ name: 'Open 2025', date_start: '2025-06-01', date_end: '2025-06-02' })
    expect(t.id).toBeDefined()
    expect(t.name).toBe('Open 2025')
    expect(t.status).toBe('draft')
    expect(t.venue_id).toBeNull()
    expect(t.created_at).toBeDefined()
    expect(t.updated_at).toBeDefined()
  })

  it('creates a tournament with explicit status', () => {
    const t = repo.create({
      name: 'Open 2025',
      date_start: '2025-06-01',
      date_end: '2025-06-02',
      status: 'registration_open'
    })
    expect(t.status).toBe('registration_open')
  })

  it('gets a tournament by id', () => {
    const created = repo.create({ name: 'Open 2025', date_start: '2025-06-01', date_end: '2025-06-02' })
    const found = repo.getById(created.id)
    expect(found?.name).toBe('Open 2025')
  })

  it('returns undefined for unknown id', () => {
    expect(repo.getById('non-existent')).toBeUndefined()
  })

  it('lists all tournaments', () => {
    repo.create({ name: 'Tournament A', date_start: '2025-06-01', date_end: '2025-06-02' })
    repo.create({ name: 'Tournament B', date_start: '2025-07-01', date_end: '2025-07-02' })
    expect(repo.list()).toHaveLength(2)
  })

  it('updates a tournament', () => {
    const t = repo.create({ name: 'Old Name', date_start: '2025-06-01', date_end: '2025-06-02' })
    const updated = repo.update(t.id, { name: 'New Name', status: 'in_progress' })
    expect(updated.name).toBe('New Name')
    expect(updated.status).toBe('in_progress')
  })

  it('sets updated_at on update', () => {
    const t = repo.create({ name: 'Open 2025', date_start: '2025-06-01', date_end: '2025-06-02' })
    const updated = repo.update(t.id, { name: 'Updated' })
    expect(updated.updated_at >= t.updated_at).toBe(true)
  })

  it('deletes a tournament', () => {
    const t = repo.create({ name: 'To Delete', date_start: '2025-06-01', date_end: '2025-06-02' })
    repo.delete(t.id)
    expect(repo.getById(t.id)).toBeUndefined()
  })
})
