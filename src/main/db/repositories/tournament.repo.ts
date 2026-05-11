import { eq, and } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { Tournament, CreateTournamentDTO, UpdateTournamentDTO } from '@shared/types/tournament'

export class TournamentRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  create(data: CreateTournamentDTO, isDemoMode = false): Tournament {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db
      .insert(schema.tournaments)
      .values({
        id,
        name: data.name,
        date_start: data.date_start,
        date_end: data.date_end,
        venue_id: data.venue_id ?? null,
        status: data.status ?? 'draft',
        age_min: data.age_min ?? null,
        age_max: data.age_max ?? null,
        points_per_set: data.points_per_set ?? 21,
        created_at: now,
        updated_at: now,
        is_demo: isDemoMode
      })
      .run()
    return this.getByIdOrThrow(id)
  }

  getById(id: string): Tournament | undefined {
    return this.db.select().from(schema.tournaments).where(eq(schema.tournaments.id, id)).get()
  }

  list(isDemoMode = false): Tournament[] {
    return this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.is_demo, isDemoMode))
      .all()
  }

  update(id: string, data: UpdateTournamentDTO): Tournament {
    this.db
      .update(schema.tournaments)
      .set({ ...data, updated_at: new Date().toISOString() })
      .where(eq(schema.tournaments.id, id))
      .run()
    return this.getByIdOrThrow(id)
  }

  delete(id: string): void {
    this.db.delete(schema.tournaments).where(eq(schema.tournaments.id, id)).run()
  }

  private getByIdOrThrow(id: string): Tournament {
    const tournament = this.getById(id)
    if (!tournament) throw new Error(`Tournament not found: ${id}`)
    return tournament
  }
}
