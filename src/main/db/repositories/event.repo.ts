import { eq, count, max, asc } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { Event, CreateEventDTO, UpdateEventDTO } from '@shared/types/event'

export class EventRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  create(data: CreateEventDTO): Event {
    const id = randomUUID()
    const maxOrder = this.db
      .select({ v: max(schema.events.order) })
      .from(schema.events)
      .where(eq(schema.events.tournament_id, data.tournament_id))
      .get()?.v ?? -1
    this.db
      .insert(schema.events)
      .values({
        id,
        tournament_id: data.tournament_id,
        name: data.name,
        category: data.category,
        max_entries: data.max_entries ?? null,
        age_min: data.age_min ?? null,
        age_max: data.age_max ?? null,
        order: maxOrder + 1
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
      .orderBy(asc(schema.events.order))
      .all()
  }

  reorder(ids: string[]): void {
    ids.forEach((id, index) => {
      this.db
        .update(schema.events)
        .set({ order: index })
        .where(eq(schema.events.id, id))
        .run()
    })
  }

  update(id: string, data: UpdateEventDTO): Event {
    this.db.update(schema.events).set(data).where(eq(schema.events.id, id)).run()
    return this.getByIdOrThrow(id)
  }

  delete(id: string): void {
    const teamsCount = this.db
      .select({ n: count() })
      .from(schema.tournament_teams)
      .where(eq(schema.tournament_teams.event_id, id))
      .get()!.n
    if (teamsCount > 0) throw new Error('EVENT_HAS_ENTRIES')

    const roundsCount = this.db
      .select({ n: count() })
      .from(schema.rounds)
      .where(eq(schema.rounds.event_id, id))
      .get()!.n
    if (roundsCount > 0) throw new Error('EVENT_HAS_ROUNDS')

    this.db.delete(schema.events).where(eq(schema.events.id, id)).run()
  }

  private getByIdOrThrow(id: string): Event {
    const event = this.getById(id)
    if (!event) throw new Error(`Event not found: ${id}`)
    return event
  }
}
