import { eq } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { Player, CreatePlayerDTO, UpdatePlayerDTO } from '@shared/types/player'

export class PlayerRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  create(data: CreatePlayerDTO): Player {
    const id = randomUUID()
    this.db
      .insert(schema.players)
      .values({ id, first_name: data.first_name, last_name: data.last_name, club: data.club ?? null, gender: data.gender ?? null })
      .run()
    return this.getByIdOrThrow(id)
  }

  getById(id: string): Player | undefined {
    return this.db.select().from(schema.players).where(eq(schema.players.id, id)).get()
  }

  list(): Player[] {
    return this.db.select().from(schema.players).all()
  }

  update(id: string, data: UpdatePlayerDTO): Player {
    this.db.update(schema.players).set(data).where(eq(schema.players.id, id)).run()
    return this.getByIdOrThrow(id)
  }

  delete(id: string): void {
    this.db.delete(schema.players).where(eq(schema.players.id, id)).run()
  }

  private getByIdOrThrow(id: string): Player {
    const player = this.getById(id)
    if (!player) throw new Error(`Player not found: ${id}`)
    return player
  }
}
