import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { assignSlot, validateConflicts } from '../../services/schedule.service'
import type { AssignSlotDTO } from '../../services/schedule.service'

export function registerScheduleHandler(): void {
  ipcMain.handle('schedule:assignSlot', (_e, matchId: string, dto: AssignSlotDTO) =>
    assignSlot(getDb(), matchId, dto)
  )

  ipcMain.handle(
    'schedule:validateConflicts',
    (_e, matchId: string, params: { teamId: string; datetime: string; duration: number }) =>
      validateConflicts(getDb(), matchId, params)
  )
}
