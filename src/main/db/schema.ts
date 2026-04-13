// Database schema — tables are added incrementally, one step at a time.
// Each change requires running: npm run db:generate

import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const venues = sqliteTable('venues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address')
})

export const tournaments = sqliteTable('tournaments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  date_start: text('date_start').notNull(),
  date_end: text('date_end').notNull(),
  venue_id: text('venue_id').references(() => venues.id),
  status: text('status', {
    enum: ['draft', 'registration_open', 'registration_closed', 'in_progress', 'finished']
  }).notNull().default('draft'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
})

export const courts = sqliteTable('courts', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  name: text('name').notNull()
})
