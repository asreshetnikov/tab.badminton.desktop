import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { VenueRepository } from '../../db/repositories/venue.repo'
import type { CreateVenueDTO, UpdateVenueDTO } from '@shared/types/venue'

export function registerVenuesHandler(): void {
  ipcMain.handle('venues:create', (_e, data: CreateVenueDTO) =>
    new VenueRepository(getDb()).create(data)
  )
  ipcMain.handle('venues:getById', (_e, id: string) =>
    new VenueRepository(getDb()).getById(id)
  )
  ipcMain.handle('venues:list', () =>
    new VenueRepository(getDb()).list()
  )
  ipcMain.handle('venues:update', (_e, id: string, data: UpdateVenueDTO) =>
    new VenueRepository(getDb()).update(id, data)
  )
  ipcMain.handle('venues:delete', (_e, id: string) =>
    new VenueRepository(getDb()).delete(id)
  )
}
