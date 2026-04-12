import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { TournamentRepository } from '../../db/repositories/tournament.repo'
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
  ipcMain.handle('tournament:delete', (_e, id: string) =>
    new TournamentRepository(getDb()).delete(id)
  )
}
