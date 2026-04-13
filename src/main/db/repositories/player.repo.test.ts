import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test-helpers'
import { PlayerRepository } from './player.repo'

describe('PlayerRepository', () => {
  let repo: PlayerRepository

  beforeEach(() => {
    repo = new PlayerRepository(createTestDb())
  })

  it('creates a player', () => {
    const p = repo.create({ first_name: 'Ivan', last_name: 'Petrov' })
    expect(p.id).toBeDefined()
    expect(p.first_name).toBe('Ivan')
    expect(p.last_name).toBe('Petrov')
    expect(p.club).toBeNull()
  })

  it('creates a player with club', () => {
    const p = repo.create({ first_name: 'Anna', last_name: 'Ivanova', club: 'Spartak' })
    expect(p.club).toBe('Spartak')
  })

  it('gets a player by id', () => {
    const created = repo.create({ first_name: 'Ivan', last_name: 'Petrov' })
    expect(repo.getById(created.id)?.last_name).toBe('Petrov')
  })

  it('returns undefined for unknown id', () => {
    expect(repo.getById('non-existent')).toBeUndefined()
  })

  it('lists all players', () => {
    repo.create({ first_name: 'Ivan', last_name: 'Petrov' })
    repo.create({ first_name: 'Anna', last_name: 'Ivanova' })
    expect(repo.list()).toHaveLength(2)
  })

  it('updates a player', () => {
    const p = repo.create({ first_name: 'Ivan', last_name: 'Petrov' })
    const updated = repo.update(p.id, { club: 'Dynamo' })
    expect(updated.club).toBe('Dynamo')
    expect(updated.first_name).toBe('Ivan')
  })

  it('deletes a player', () => {
    const p = repo.create({ first_name: 'Ivan', last_name: 'Petrov' })
    repo.delete(p.id)
    expect(repo.getById(p.id)).toBeUndefined()
  })
})
