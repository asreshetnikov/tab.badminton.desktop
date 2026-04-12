import { eq } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { Venue, CreateVenueDTO, UpdateVenueDTO } from '@shared/types/venue'

export class VenueRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  create(data: CreateVenueDTO): Venue {
    const id = randomUUID()
    this.db.insert(schema.venues).values({ id, name: data.name, address: data.address ?? null }).run()
    return this.getByIdOrThrow(id)
  }

  getById(id: string): Venue | undefined {
    return this.db.select().from(schema.venues).where(eq(schema.venues.id, id)).get()
  }

  list(): Venue[] {
    return this.db.select().from(schema.venues).all()
  }

  update(id: string, data: UpdateVenueDTO): Venue {
    this.db.update(schema.venues).set(data).where(eq(schema.venues.id, id)).run()
    return this.getByIdOrThrow(id)
  }

  delete(id: string): void {
    this.db.delete(schema.venues).where(eq(schema.venues.id, id)).run()
  }

  private getByIdOrThrow(id: string): Venue {
    const venue = this.getById(id)
    if (!venue) throw new Error(`Venue not found: ${id}`)
    return venue
  }
}
