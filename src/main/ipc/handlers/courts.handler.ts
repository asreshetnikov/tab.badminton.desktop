import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { CourtRepository } from '../../db/repositories/court.repo'
import type { CreateCourtDTO, UpdateCourtDTO } from '@shared/types/court'

export function registerCourtsHandler(): void {
  ipcMain.handle('courts:create', (_e, data: CreateCourtDTO) =>
    new CourtRepository(getDb()).create(data)
  )
  ipcMain.handle('courts:listByTournament', (_e, tournamentId: string) =>
    new CourtRepository(getDb()).listByTournament(tournamentId)
  )
  ipcMain.handle('courts:update', (_e, id: string, data: UpdateCourtDTO) =>
    new CourtRepository(getDb()).update(id, data)
  )
  ipcMain.handle('courts:delete', (_e, id: string) =>
    new CourtRepository(getDb()).delete(id)
  )
}
