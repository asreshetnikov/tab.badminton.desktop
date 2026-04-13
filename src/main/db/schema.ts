// Database schema — tables are added incrementally, one step at a time.
// Each change requires running: npm run db:generate

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

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

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  club: text('club')
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category', { enum: ['MS', 'WS', 'MD', 'WD', 'XD'] }).notNull(),
  max_entries: integer('max_entries')
})

export const tournament_players = sqliteTable('tournament_players', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  player_id: text('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'accepted', 'rejected'] }).notNull().default('pending'),
  registered_at: text('registered_at').notNull()
})

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category', { enum: ['MS', 'WS', 'MD', 'WD', 'XD'] }).notNull()
})

export const team_players = sqliteTable('team_players', {
  id: text('id').primaryKey(),
  team_id: text('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  player_id: text('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  position: integer('position').notNull()
})

export const courts = sqliteTable('courts', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  name: text('name').notNull()
})
