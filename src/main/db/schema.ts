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
  age_min: integer('age_min'),
  age_max: integer('age_max'),
  rest_minutes: integer('rest_minutes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
})

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  club: text('club'),
  gender: text('gender', { enum: ['M', 'F'] }),
  birth_year: integer('birth_year')
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category', { enum: ['MS', 'WS', 'MD', 'WD', 'XD'] }).notNull(),
  max_entries: integer('max_entries'),
  age_min: integer('age_min'),
  age_max: integer('age_max')
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

export const tournament_teams = sqliteTable('tournament_teams', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  event_id: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  team_id: text('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' })
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

export const rounds = sqliteTable('rounds', {
  id: text('id').primaryKey(),
  event_id: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', { enum: ['round_robin', 'playoff'] }).notNull(),
  order: integer('order').notNull(),
  qualification_rule: text('qualification_rule')
})

export const courts = sqliteTable('courts', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  name: text('name').notNull()
})

export const round_teams = sqliteTable('round_teams', {
  id: text('id').primaryKey(),
  round_id: text('round_id')
    .notNull()
    .references(() => rounds.id, { onDelete: 'cascade' }),
  team_id: text('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['active', 'withdrawn'] }).notNull().default('active'),
  seed: integer('seed'),
  checked_in: integer('checked_in', { mode: 'boolean' }).notNull().default(false)
})

export const round_table = sqliteTable('round_table', {
  id: text('id').primaryKey(),
  round_id: text('round_id')
    .notNull()
    .references(() => rounds.id, { onDelete: 'cascade' }),
  team_id: text('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  sets_won: integer('sets_won').notNull().default(0),
  sets_lost: integer('sets_lost').notNull().default(0),
  points_won: integer('points_won').notNull().default(0),
  points_lost: integer('points_lost').notNull().default(0),
  position: integer('position')
})

export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  round_id: text('round_id')
    .notNull()
    .references(() => rounds.id, { onDelete: 'cascade' }),
  team1_id: text('team1_id').references(() => teams.id, { onDelete: 'set null' }),
  team2_id: text('team2_id').references(() => teams.id, { onDelete: 'set null' }),
  winner_team_id: text('winner_team_id').references(() => teams.id, { onDelete: 'set null' }),
  s1: integer('s1'),
  s2: integer('s2'),
  status: text('status', {
    enum: ['scheduled', 'ready', 'live', 'finished', 'walkover', 'retired']
  })
    .notNull()
    .default('scheduled'),
  scheduled_at: text('scheduled_at'),
  court_id: text('court_id').references(() => courts.id, { onDelete: 'set null' }),
  win_match_id: text('win_match_id'),
  left_match_id: text('left_match_id'),
  right_match_id: text('right_match_id'),
  tour: integer('tour'),
  not_before_hard: text('not_before_hard'),
  not_before_soft: text('not_before_soft'),
  actual_start: text('actual_start'),
  actual_end: text('actual_end')
})

export const tournament_stage_durations = sqliteTable('tournament_stage_durations', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  bracket_round: integer('bracket_round').notNull(),
  duration_minutes: integer('duration_minutes').notNull()
})

export const match_sets = sqliteTable('match_sets', {
  id: text('id').primaryKey(),
  match_id: text('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
  s1: integer('s1').notNull().default(0),
  s2: integer('s2').notNull().default(0)
})

export const tournament_day_settings = sqliteTable('tournament_day_settings', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  start_time: text('start_time').notNull(),
  match_duration: integer('match_duration').notNull()
})

