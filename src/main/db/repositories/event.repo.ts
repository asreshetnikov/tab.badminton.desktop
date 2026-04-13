import { eq } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { Event, CreateEventDTO, UpdateEventDTO } from '@shared/types/event'

export class EventRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  create(data: CreateEventDTO): Event {
    const id = randomUUID()
    this.db
      .insert(schema.events)
      .values({
        id,
        tournament_id: data.tournament_id,
        name: data.name,
        category: data.category,
        max_entries: data.max_entries ?? null
      })
      .run()
    return this.getByIdOrThrow(id)
  }

  getById(id: string): Event | undefined {
    return this.db.select().from(schema.events).where(eq(schema.events.id, id)).get()
  }

  listByTournament(tournamentId: string): Event[] {
    return this.db
      .select()
      .from(schema.events)
      .where(eq(schema.events.tournament_id, tournamentId))
      .all()
  }

  update(id: string, data: UpdateEventDTO): Event {
    this.db.update(schema.events).set(data).where(eq(schema.events.id, id)).run()
    return this.getByIdOrThrow(id)
  }

  delete(id: string): void {
    this.db.delete(schema.events).where(eq(schema.events.id, id)).run()
  }

  private getByIdOrThrow(id: string): Event {
    const event = this.getById(id)
    if (!event) throw new Error(`Event not found: ${id}`)
    return event
  }
}
