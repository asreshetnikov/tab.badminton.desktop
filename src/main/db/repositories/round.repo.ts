import { eq, max } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { Round, CreateRoundDTO, UpdateRoundDTO } from '@shared/types/round'

export class RoundRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  create(data: CreateRoundDTO): Round {
    const id = randomUUID()
    const result = this.db
      .select({ maxOrder: max(schema.rounds.order) })
      .from(schema.rounds)
      .where(eq(schema.rounds.event_id, data.event_id))
      .get()
    const order = (result?.maxOrder ?? 0) + 1

    this.db
      .insert(schema.rounds)
      .values({ id, event_id: data.event_id, name: data.name, type: data.type, order })
      .run()
    return this.getByIdOrThrow(id)
  }

  listByEvent(eventId: string): Round[] {
    return this.db
      .select()
      .from(schema.rounds)
      .where(eq(schema.rounds.event_id, eventId))
      .orderBy(schema.rounds.order)
      .all()
  }

  update(id: string, data: UpdateRoundDTO): Round {
    this.db.update(schema.rounds).set(data).where(eq(schema.rounds.id, id)).run()
    return this.getByIdOrThrow(id)
  }

  delete(id: string): void {
    this.db.delete(schema.rounds).where(eq(schema.rounds.id, id)).run()
  }

  private getByIdOrThrow(id: string): Round {
    const row = this.db.select().from(schema.rounds).where(eq(schema.rounds.id, id)).get()
    if (!row) throw new Error(`Round not found: ${id}`)
    return row
  }
}
