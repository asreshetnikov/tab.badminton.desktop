import { eq } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { TournamentPlayerWithPlayer, RegistrationStatus } from '@shared/types/tournament-player'

export class TournamentPlayerRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  register(tournamentId: string, playerId: string): TournamentPlayerWithPlayer {
    const id = randomUUID()
    const registered_at = new Date().toISOString()
    this.db
      .insert(schema.tournament_players)
      .values({ id, tournament_id: tournamentId, player_id: playerId, registered_at })
      .run()
    return this.getByIdOrThrow(id)
  }

  registerMany(tournamentId: string, playerIds: string[]): TournamentPlayerWithPlayer[] {
    return playerIds.map((playerId) => this.register(tournamentId, playerId))
  }

  listByTournament(tournamentId: string): TournamentPlayerWithPlayer[] {
    const rows = this.db
      .select()
      .from(schema.tournament_players)
      .where(eq(schema.tournament_players.tournament_id, tournamentId))
      .all()

    return rows.map((row) => {
      const player = this.db
        .select()
        .from(schema.players)
        .where(eq(schema.players.id, row.player_id))
        .get()
      if (!player) throw new Error(`Player not found: ${row.player_id}`)
      return { ...row, player }
    })
  }

  updateStatus(id: string, status: RegistrationStatus): TournamentPlayerWithPlayer {
    this.db
      .update(schema.tournament_players)
      .set({ status })
      .where(eq(schema.tournament_players.id, id))
      .run()
    return this.getByIdOrThrow(id)
  }

  remove(id: string): void {
    this.db.delete(schema.tournament_players).where(eq(schema.tournament_players.id, id)).run()
  }

  private getByIdOrThrow(id: string): TournamentPlayerWithPlayer {
    const row = this.db
      .select()
      .from(schema.tournament_players)
      .where(eq(schema.tournament_players.id, id))
      .get()
    if (!row) throw new Error(`TournamentPlayer not found: ${id}`)
    const player = this.db
      .select()
      .from(schema.players)
      .where(eq(schema.players.id, row.player_id))
      .get()
    if (!player) throw new Error(`Player not found: ${row.player_id}`)
    return { ...row, player }
  }
}
