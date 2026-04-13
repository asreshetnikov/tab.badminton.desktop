import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { PlayerRepository } from '../../db/repositories/player.repo'
import type { CreatePlayerDTO, UpdatePlayerDTO } from '@shared/types/player'

export function registerPlayersHandler(): void {
  ipcMain.handle('players:create', (_e, data: CreatePlayerDTO) =>
    new PlayerRepository(getDb()).create(data)
  )
  ipcMain.handle('players:getById', (_e, id: string) =>
    new PlayerRepository(getDb()).getById(id)
  )
  ipcMain.handle('players:list', () =>
    new PlayerRepository(getDb()).list()
  )
  ipcMain.handle('players:update', (_e, id: string, data: UpdatePlayerDTO) =>
    new PlayerRepository(getDb()).update(id, data)
  )
  ipcMain.handle('players:delete', (_e, id: string) =>
    new PlayerRepository(getDb()).delete(id)
  )
}
