import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { EventRepository } from '../../db/repositories/event.repo'
import type { CreateEventDTO, UpdateEventDTO } from '@shared/types/event'

export function registerEventsHandler(): void {
  ipcMain.handle('events:create', (_e, data: CreateEventDTO) =>
    new EventRepository(getDb()).create(data)
  )
  ipcMain.handle('events:listByTournament', (_e, tournamentId: string) =>
    new EventRepository(getDb()).listByTournament(tournamentId)
  )
  ipcMain.handle('events:update', (_e, id: string, data: UpdateEventDTO) =>
    new EventRepository(getDb()).update(id, data)
  )
  ipcMain.handle('events:delete', (_e, id: string) =>
    new EventRepository(getDb()).delete(id)
  )
}
