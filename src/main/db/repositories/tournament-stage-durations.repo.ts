import { and, eq } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { randomUUID } from 'crypto'
import * as schema from '../schema'
import type { TournamentStageDuration, UpsertStageDurationDTO } from '@shared/types/tournament-stage-duration'

export class TournamentStageDurationsRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  listByTournament(tournamentId: string): TournamentStageDuration[] {
    return this.db
      .select()
      .from(schema.tournament_stage_durations)
      .where(eq(schema.tournament_stage_durations.tournament_id, tournamentId))
      .all()
  }

  upsert(tournamentId: string, bracketRound: number, dto: UpsertStageDurationDTO): TournamentStageDuration {
    const existing = this.db
      .select()
      .from(schema.tournament_stage_durations)
      .where(
        and(
          eq(schema.tournament_stage_durations.tournament_id, tournamentId),
          eq(schema.tournament_stage_durations.bracket_round, bracketRound)
        )
      )
      .get()

    if (existing) {
      this.db
        .update(schema.tournament_stage_durations)
        .set({ duration_minutes: dto.duration_minutes })
        .where(eq(schema.tournament_stage_durations.id, existing.id))
        .run()
      return { ...existing, duration_minutes: dto.duration_minutes }
    }

    const id = randomUUID()
    this.db
      .insert(schema.tournament_stage_durations)
      .values({ id, tournament_id: tournamentId, bracket_round: bracketRound, duration_minutes: dto.duration_minutes })
      .run()
    return { id, tournament_id: tournamentId, bracket_round: bracketRound, duration_minutes: dto.duration_minutes }
  }

  delete(id: string): void {
    this.db.delete(schema.tournament_stage_durations).where(eq(schema.tournament_stage_durations.id, id)).run()
  }
}
