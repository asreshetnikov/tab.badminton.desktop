import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { TeamRepository } from '../../db/repositories/team.repo'
import { getAppSettings } from '../../services/app-settings.service'
import type { CreateTeamDTO } from '@shared/types/team'

export function registerTeamsHandler(): void {
  ipcMain.handle('teams:create', (_e, data: CreateTeamDTO) =>
    new TeamRepository(getDb()).create(data, getAppSettings().demoMode)
  )
  ipcMain.handle('teams:list', () =>
    new TeamRepository(getDb()).list(getAppSettings().demoMode)
  )
  ipcMain.handle('teams:update', (_e, id: string, data: { name: string }) =>
    new TeamRepository(getDb()).update(id, data)
  )
  ipcMain.handle('teams:delete', (_e, id: string) =>
    new TeamRepository(getDb()).delete(id)
  )
}
