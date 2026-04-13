import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '../test-helpers'
import { TournamentRepository } from './tournament.repo'
import { PlayerRepository } from './player.repo'
import { TeamRepository } from './team.repo'
import { EventRepository } from './event.repo'
import { TournamentTeamRepository } from './tournament-team.repo'

describe('TournamentTeamRepository', () => {
  let repo: TournamentTeamRepository
  let tournamentId: string
  let eventId: string
  let teamId: string

  beforeEach(() => {
    const db = createTestDb()
    repo = new TournamentTeamRepository(db)
    tournamentId = new TournamentRepository(db).create({
      name: 'Open 2025',
      date_start: '2025-06-01',
      date_end: '2025-06-02'
    }).id
    eventId = new EventRepository(db).create({
      tournament_id: tournamentId,
      name: "Men's Singles",
      category: 'MS'
    }).id
    const playerId = new PlayerRepository(db).create({ first_name: 'Ivan', last_name: 'Petrov' }).id
    teamId = new TeamRepository(db).create({ name: 'Petrov', category: 'MS', player_ids: [playerId] }).id
  })

  it('adds a team to a tournament event', () => {
    const tt = repo.add(tournamentId, eventId, teamId)
    expect(tt.id).toBeDefined()
    expect(tt.event_id).toBe(eventId)
    expect(tt.team.name).toBe('Petrov')
    expect(tt.team.players).toHaveLength(1)
  })

  it('lists teams by tournament', () => {
    repo.add(tournamentId, eventId, teamId)
    expect(repo.listByTournament(tournamentId)).toHaveLength(1)
  })

  it('returns empty list when no teams added', () => {
    expect(repo.listByTournament(tournamentId)).toHaveLength(0)
  })

  it('addMany adds multiple teams to the same event', () => {
    const db = (repo as any).db
    const p2 = new PlayerRepository(db).create({ first_name: 'Alexei', last_name: 'Smirnov' }).id
    const team2Id = new TeamRepository(db).create({ name: 'Smirnov', category: 'MS', player_ids: [p2] }).id
    repo.addMany(tournamentId, eventId, [teamId, team2Id])
    expect(repo.listByTournament(tournamentId)).toHaveLength(2)
  })

  it('removes a team', () => {
    const tt = repo.add(tournamentId, eventId, teamId)
    repo.remove(tt.id)
    expect(repo.listByTournament(tournamentId)).toHaveLength(0)
  })
})
