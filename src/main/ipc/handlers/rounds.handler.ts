import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { RoundRepository } from '../../db/repositories/round.repo'
import type { CreateRoundDTO, UpdateRoundDTO } from '@shared/types/round'

export function registerRoundsHandler(): void {
  ipcMain.handle('rounds:create', (_e, data: CreateRoundDTO) =>
    new RoundRepository(getDb()).create(data)
  )
  ipcMain.handle('rounds:listByEvent', (_e, eventId: string) =>
    new RoundRepository(getDb()).listByEvent(eventId)
  )
  ipcMain.handle('rounds:update', (_e, id: string, data: UpdateRoundDTO) =>
    new RoundRepository(getDb()).update(id, data)
  )
  ipcMain.handle('rounds:delete', (_e, id: string) =>
    new RoundRepository(getDb()).delete(id)
  )
}
