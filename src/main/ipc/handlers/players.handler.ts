import { ipcMain, dialog } from 'electron'
import { readFileSync } from 'fs'
import { getDb } from '../../db/client'
import { PlayerRepository } from '../../db/repositories/player.repo'
import { getAppSettings } from '../../services/app-settings.service'
import { parsePlayersCSV } from '../../services/import.service'
import type { CreatePlayerDTO, UpdatePlayerDTO } from '@shared/types/player'

export function registerPlayersHandler(): void {
  ipcMain.handle('players:create', (_e, data: CreatePlayerDTO) =>
    new PlayerRepository(getDb()).create(data, getAppSettings().demoMode)
  )
  ipcMain.handle('players:getById', (_e, id: string) =>
    new PlayerRepository(getDb()).getById(id)
  )
  ipcMain.handle('players:list', () =>
    new PlayerRepository(getDb()).list(getAppSettings().demoMode)
  )
  ipcMain.handle('players:update', (_e, id: string, data: UpdatePlayerDTO) =>
    new PlayerRepository(getDb()).update(id, data)
  )
  ipcMain.handle('players:delete', (_e, id: string) =>
    new PlayerRepository(getDb()).delete(id)
  )

  ipcMain.handle('players:importCSV', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import Players from CSV',
      filters: [{ name: 'CSV files', extensions: ['csv', 'txt'] }],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return { imported: 0, canceled: true }

    const content = readFileSync(filePaths[0], 'utf-8')
    const rows = parsePlayersCSV(content)
    const repo = new PlayerRepository(getDb())
    const isDemoMode = getAppSettings().demoMode
    for (const row of rows) repo.create(row, isDemoMode)
    return { imported: rows.length, canceled: false }
  })
}
