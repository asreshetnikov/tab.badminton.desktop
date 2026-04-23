import { ipcMain } from 'electron'
import { eq, and, count } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { TournamentRepository } from '../../db/repositories/tournament.repo'
import * as schema from '../../db/schema'
import type { CreateTournamentDTO, UpdateTournamentDTO } from '@shared/types/tournament'

export function registerTournamentHandler(): void {
  ipcMain.handle('tournament:create', (_e, data: CreateTournamentDTO) =>
    new TournamentRepository(getDb()).create(data)
  )
  ipcMain.handle('tournament:getById', (_e, id: string) =>
    new TournamentRepository(getDb()).getById(id)
  )
  ipcMain.handle('tournament:list', () =>
    new TournamentRepository(getDb()).list()
  )
  ipcMain.handle('tournament:update', (_e, id: string, data: UpdateTournamentDTO) =>
    new TournamentRepository(getDb()).update(id, data)
  )
  ipcMain.handle('tournament:delete', (_e, id: string) => {
    const db = getDb()
    const { cnt } = db
      .select({ cnt: count() })
      .from(schema.tournament_players)
      .where(
        and(
          eq(schema.tournament_players.tournament_id, id),
          eq(schema.tournament_players.status, 'accepted')
        )
      )
      .get()!
    if (cnt > 0) {
      throw new Error('Cannot delete tournament with accepted player registrations')
    }
    new TournamentRepository(db).delete(id)
  })
}
