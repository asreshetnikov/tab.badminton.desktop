import { eq } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { Court, CreateCourtDTO, UpdateCourtDTO } from '@shared/types/court'

export class CourtRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  create(data: CreateCourtDTO): Court {
    const id = randomUUID()
    this.db.insert(schema.courts).values({ id, tournament_id: data.tournament_id, name: data.name }).run()
    return this.getByIdOrThrow(id)
  }

  getById(id: string): Court | undefined {
    return this.db.select().from(schema.courts).where(eq(schema.courts.id, id)).get()
  }

  listByTournament(tournamentId: string): Court[] {
    return this.db
      .select()
      .from(schema.courts)
      .where(eq(schema.courts.tournament_id, tournamentId))
      .all()
  }

  update(id: string, data: UpdateCourtDTO): Court {
    this.db.update(schema.courts).set(data).where(eq(schema.courts.id, id)).run()
    return this.getByIdOrThrow(id)
  }

  delete(id: string): void {
    this.db.delete(schema.courts).where(eq(schema.courts.id, id)).run()
  }

  private getByIdOrThrow(id: string): Court {
    const court = this.getById(id)
    if (!court) throw new Error(`Court not found: ${id}`)
    return court
  }
}
