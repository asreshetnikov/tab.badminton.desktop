import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test-helpers'
import { VenueRepository } from './venue.repo'

describe('VenueRepository', () => {
  let repo: VenueRepository

  beforeEach(() => {
    repo = new VenueRepository(createTestDb())
  })

  it('creates a venue and returns it with an id', () => {
    const venue = repo.create({ name: 'Sports Hall', address: '123 Main St' })
    expect(venue.id).toBeDefined()
    expect(venue.name).toBe('Sports Hall')
    expect(venue.address).toBe('123 Main St')
  })

  it('creates a venue with null address when not provided', () => {
    const venue = repo.create({ name: 'Arena' })
    expect(venue.address).toBeNull()
  })

  it('gets a venue by id', () => {
    const created = repo.create({ name: 'Sports Hall' })
    const found = repo.getById(created.id)
    expect(found).toBeDefined()
    expect(found?.name).toBe('Sports Hall')
  })

  it('returns undefined for unknown id', () => {
    expect(repo.getById('non-existent')).toBeUndefined()
  })

  it('lists all venues', () => {
    repo.create({ name: 'Venue A' })
    repo.create({ name: 'Venue B' })
    expect(repo.list()).toHaveLength(2)
  })

  it('returns empty array when no venues exist', () => {
    expect(repo.list()).toHaveLength(0)
  })

  it('updates a venue', () => {
    const venue = repo.create({ name: 'Old Name', address: 'Old Address' })
    const updated = repo.update(venue.id, { name: 'New Name' })
    expect(updated.name).toBe('New Name')
    expect(updated.address).toBe('Old Address')
  })

  it('deletes a venue', () => {
    const venue = repo.create({ name: 'To Delete' })
    repo.delete(venue.id)
    expect(repo.getById(venue.id)).toBeUndefined()
  })
})
