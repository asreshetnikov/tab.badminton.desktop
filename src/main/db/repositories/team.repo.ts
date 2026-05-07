import { eq, inArray } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { TeamWithPlayers, CreateTeamDTO } from '@shared/types/team'

export class TeamRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  create(data: CreateTeamDTO, isDemoMode = false): TeamWithPlayers {
    const id = randomUUID()
    this.db.insert(schema.teams).values({ id, name: data.name, category: data.category, is_demo: isDemoMode }).run()

    data.player_ids.forEach((player_id, index) => {
      this.db
        .insert(schema.team_players)
        .values({ id: randomUUID(), team_id: id, player_id, position: index + 1 })
        .run()
    })

    return this.getByIdOrThrow(id)
  }

  getById(id: string): TeamWithPlayers | undefined {
    const team = this.db.select().from(schema.teams).where(eq(schema.teams.id, id)).get()
    if (!team) return undefined
    return { ...team, players: this.loadPlayers(id) }
  }

  list(isDemoMode = false): TeamWithPlayers[] {
    const teams = this.db.select().from(schema.teams).where(eq(schema.teams.is_demo, isDemoMode)).all()
    return teams.map((t) => ({ ...t, players: this.loadPlayers(t.id) }))
  }

  update(id: string, data: { name: string }): TeamWithPlayers {
    this.db.update(schema.teams).set({ name: data.name }).where(eq(schema.teams.id, id)).run()
    return this.getByIdOrThrow(id)
  }

  delete(id: string): void {
    this.db.delete(schema.teams).where(eq(schema.teams.id, id)).run()
  }

  private loadPlayers(teamId: string) {
    const rows = this.db
      .select()
      .from(schema.team_players)
      .where(eq(schema.team_players.team_id, teamId))
      .orderBy(schema.team_players.position)
      .all()

    if (rows.length === 0) return []

    const playerIds = rows.map((r) => r.player_id)
    const playerMap = new Map(
      this.db
        .select()
        .from(schema.players)
        .where(inArray(schema.players.id, playerIds))
        .all()
        .map((p) => [p.id, p])
    )

    return rows
      .map((r) => playerMap.get(r.player_id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
  }

  private getByIdOrThrow(id: string): TeamWithPlayers {
    const team = this.getById(id)
    if (!team) throw new Error(`Team not found: ${id}`)
    return team
  }
}
