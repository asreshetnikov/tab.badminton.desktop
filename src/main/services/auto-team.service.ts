import { and, eq } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../db/schema'

/**
 * When a player is accepted into a tournament, ensure a singles team exists for
 * them in the global registry (MS for males, WS for females).
 *
 * No-ops if:
 * - player has no gender set
 * - a singles team for this player in that category already exists
 */
export function ensureSinglesTeamOnAccept(
  db: BetterSQLite3Database<typeof schema>,
  playerId: string
): void {
  const player = db.select().from(schema.players).where(eq(schema.players.id, playerId)).get()
  if (!player?.gender) return

  const category = player.gender === 'M' ? 'MS' : 'WS'

  // Check if the player already has a singles team in this category
  const existing = db
    .select({ team_id: schema.team_players.team_id })
    .from(schema.team_players)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.team_players.team_id))
    .where(
      and(
        eq(schema.team_players.player_id, playerId),
        eq(schema.teams.category, category)
      )
    )
    .get()

  if (existing) return

  // Create a new singles team named after the player
  const teamId = randomUUID()
  db.insert(schema.teams)
    .values({ id: teamId, name: `${player.last_name} ${player.first_name}`, category })
    .run()
  db.insert(schema.team_players)
    .values({ id: randomUUID(), team_id: teamId, player_id: playerId, position: 1 })
    .run()
}
