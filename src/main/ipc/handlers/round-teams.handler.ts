import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { RoundTeamRepository } from '../../db/repositories/round-team.repo'
import * as schema from '../../db/schema'

function validateAgeRestriction(roundId: string, teamId: string): void {
  const db = getDb()

  const round = db.select().from(schema.rounds).where(eq(schema.rounds.id, roundId)).get()
  if (!round) return

  const event = db.select().from(schema.events).where(eq(schema.events.id, round.event_id)).get()
  if (!event || (event.age_min == null && event.age_max == null)) return

  const tournament = db
    .select()
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, event.tournament_id))
    .get()
  if (!tournament) return

  const tournamentYear = new Date(tournament.date_start).getFullYear()

  const teamPlayerRows = db
    .select()
    .from(schema.team_players)
    .where(eq(schema.team_players.team_id, teamId))
    .all()

  const playerIds = teamPlayerRows.map((r) => r.player_id)
  if (playerIds.length === 0) return

  for (const playerId of playerIds) {
    const player = db.select().from(schema.players).where(eq(schema.players.id, playerId)).get()
    if (!player || player.birth_year == null) continue

    const age = tournamentYear - player.birth_year
    if (event.age_min != null && age < event.age_min) {
      throw new Error(
        `Player ${player.first_name} ${player.last_name} (born ${player.birth_year}, age ${age}) is too young for this category (min age: ${event.age_min})`
      )
    }
    if (event.age_max != null && age > event.age_max) {
      throw new Error(
        `Player ${player.first_name} ${player.last_name} (born ${player.birth_year}, age ${age}) is too old for this category (max age: ${event.age_max})`
      )
    }
  }
}

export function registerRoundTeamsHandler(): void {
  ipcMain.handle('roundTeams:add', (_e, roundId: string, teamId: string) => {
    validateAgeRestriction(roundId, teamId)
    return new RoundTeamRepository(getDb()).add(roundId, teamId)
  })
  ipcMain.handle('roundTeams:addMany', (_e, roundId: string, teamIds: string[]) => {
    for (const teamId of teamIds) {
      validateAgeRestriction(roundId, teamId)
    }
    return new RoundTeamRepository(getDb()).addMany(roundId, teamIds)
  })
  ipcMain.handle('roundTeams:listByRound', (_e, roundId: string) =>
    new RoundTeamRepository(getDb()).listByRound(roundId)
  )
  ipcMain.handle('roundTeams:remove', (_e, id: string) =>
    new RoundTeamRepository(getDb()).remove(id)
  )
  ipcMain.handle('roundTeams:listTableByRound', (_e, roundId: string) =>
    new RoundTeamRepository(getDb()).listTableWithTeamsByRound(roundId)
  )
}
