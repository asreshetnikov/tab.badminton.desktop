/**
 * Seed the local database with a tournament matching test 20 structure:
 *   MS 50 teams, WS 40, XD 40, MD 26, WD 20 — 4 courts — 30-min stage durations
 * Run: npx tsx scripts/seed-test20.ts
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { resolve } from 'path'
import { homedir } from 'os'
import * as schema from '../src/main/db/schema'
import { TournamentRepository } from '../src/main/db/repositories/tournament.repo'
import { EventRepository } from '../src/main/db/repositories/event.repo'
import { PlayerRepository } from '../src/main/db/repositories/player.repo'
import { TeamRepository } from '../src/main/db/repositories/team.repo'
import { RoundRepository } from '../src/main/db/repositories/round.repo'
import { RoundTeamRepository } from '../src/main/db/repositories/round-team.repo'
import { generateBracket } from '../src/main/services/playoff.service'
import { autoSchedule } from '../src/main/services/scheduler.service'
import type { EventCategory } from '../src/shared/types/event'

const DB_PATH = resolve(homedir(), 'Library/Application Support/tab-badminton/tournament.db')
console.log('Opening DB:', DB_PATH)

const sqlite = new Database(DB_PATH)
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

// ── Tournament ────────────────────────────────────────────────────────────────
const tournament = new TournamentRepository(db).create({
  name: 'Spring Cup Test (seed)',
  date_start: '2026-04-24',
  date_end: '2026-04-26',
  status: 'in_progress'
})
db.update(schema.tournaments)
  .set({ rest_minutes: 30 })
  .where(eq(schema.tournaments.id, tournament.id))
  .run()
console.log('Tournament:', tournament.id)

// ── Courts ────────────────────────────────────────────────────────────────────
for (let i = 1; i <= 4; i++) {
  db.insert(schema.courts)
    .values({ id: `sc-court-${tournament.id}-${i}`, tournament_id: tournament.id, name: `Court ${i}` })
    .run()
}

// ── Stage durations ───────────────────────────────────────────────────────────
for (let br = 1; br <= 5; br++) {
  db.insert(schema.tournament_stage_durations)
    .values({
      id: `sc-stage-${tournament.id}-${br}`,
      tournament_id: tournament.id,
      bracket_round: br,
      duration_minutes: 30
    })
    .run()
}

// ── Helper: add a playoff round with N teams ──────────────────────────────────
function addPlayoffRound(category: EventCategory, namePrefix: string, teamCount: number): string {
  const event = new EventRepository(db).create({
    tournament_id: tournament.id,
    name: `${namePrefix} Event`,
    category
  })
  const round = new RoundRepository(db).create({
    event_id: event.id,
    name: `${namePrefix} Playoff`,
    type: 'playoff'
  })
  const roundTeams = new RoundTeamRepository(db)
  for (let i = 1; i <= teamCount; i++) {
    const player = new PlayerRepository(db).create({
      first_name: namePrefix,
      last_name: String(i),
      gender: category === 'WS' || category === 'WD' ? 'F' : 'M'
    })
    const team = new TeamRepository(db).create({
      name: `${namePrefix} ${i}`,
      category,
      player_ids: [player.id]
    })
    const rt = roundTeams.add(round.id, team.id)
    db.update(schema.round_teams).set({ seed: i }).where(eq(schema.round_teams.id, rt.id)).run()
  }
  generateBracket(db, round.id)
  console.log(`  ${namePrefix}: round ${round.id}`)
  return round.id
}

// ── Events ────────────────────────────────────────────────────────────────────
addPlayoffRound('MS', 'MS', 50)
addPlayoffRound('WS', 'WS', 40)
addPlayoffRound('XD', 'XD', 40)
addPlayoffRound('MD', 'MD', 26)
addPlayoffRound('WD', 'WD', 20)

// ── Auto-schedule ─────────────────────────────────────────────────────────────
console.log('Running autoSchedule…')
autoSchedule(db, tournament.id)
console.log('Done. Open the app and navigate to the tournament schedule.')
