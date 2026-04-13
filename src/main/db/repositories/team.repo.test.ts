import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test-helpers'
import { PlayerRepository } from './player.repo'
import { TeamRepository } from './team.repo'

describe('TeamRepository', () => {
  let teams: TeamRepository
  let playerId1: string
  let playerId2: string

  beforeEach(() => {
    const db = createTestDb()
    const players = new PlayerRepository(db)
    teams = new TeamRepository(db)
    playerId1 = players.create({ first_name: 'Ivan', last_name: 'Petrov' }).id
    playerId2 = players.create({ first_name: 'Georgi', last_name: 'Ivanov' }).id
  })

  it('creates a singles team', () => {
    const team = teams.create({ name: 'Petrov', category: 'MS', player_ids: [playerId1] })
    expect(team.id).toBeDefined()
    expect(team.name).toBe('Petrov')
    expect(team.category).toBe('MS')
    expect(team.players).toHaveLength(1)
    expect(team.players[0].last_name).toBe('Petrov')
  })

  it('creates a doubles team with players in order', () => {
    const team = teams.create({
      name: 'Petrov / Ivanov',
      category: 'MD',
      player_ids: [playerId1, playerId2]
    })
    expect(team.players).toHaveLength(2)
    expect(team.players[0].last_name).toBe('Petrov')
    expect(team.players[1].last_name).toBe('Ivanov')
  })

  it('lists all teams', () => {
    teams.create({ name: 'Petrov', category: 'MS', player_ids: [playerId1] })
    teams.create({ name: 'Ivanov', category: 'WS', player_ids: [playerId2] })
    expect(teams.list()).toHaveLength(2)
  })

  it('deletes a team and cascades to team_players', () => {
    const team = teams.create({ name: 'Petrov / Ivanov', category: 'MD', player_ids: [playerId1, playerId2] })
    teams.delete(team.id)
    expect(teams.getById(team.id)).toBeUndefined()
  })

  it('returns undefined for unknown id', () => {
    expect(teams.getById('non-existent')).toBeUndefined()
  })
})
