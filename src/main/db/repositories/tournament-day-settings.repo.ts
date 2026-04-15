import { and, eq } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { TournamentDaySetting, UpsertTournamentDaySettingDTO } from '@shared/types/tournament-day-settings'

export class TournamentDaySettingsRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  listByTournament(tournamentId: string): TournamentDaySetting[] {
    return this.db
      .select()
      .from(schema.tournament_day_settings)
      .where(eq(schema.tournament_day_settings.tournament_id, tournamentId))
      .all()
  }

  upsert(tournamentId: string, date: string, dto: UpsertTournamentDaySettingDTO): TournamentDaySetting {
    const existing = this.db
      .select()
      .from(schema.tournament_day_settings)
      .where(
        and(
          eq(schema.tournament_day_settings.tournament_id, tournamentId),
          eq(schema.tournament_day_settings.date, date)
        )
      )
      .get()

    if (existing) {
      this.db
        .update(schema.tournament_day_settings)
        .set({ start_time: dto.start_time, match_duration: dto.match_duration })
        .where(eq(schema.tournament_day_settings.id, existing.id))
        .run()
      return { ...existing, start_time: dto.start_time, match_duration: dto.match_duration }
    }

    const id = randomUUID()
    this.db
      .insert(schema.tournament_day_settings)
      .values({ id, tournament_id: tournamentId, date, ...dto })
      .run()
    return { id, tournament_id: tournamentId, date, ...dto }
  }

  delete(id: string): void {
    this.db.delete(schema.tournament_day_settings).where(eq(schema.tournament_day_settings.id, id)).run()
  }
}
