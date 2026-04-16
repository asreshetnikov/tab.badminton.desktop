import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import {
  assignSlot,
  validateConflicts,
  getOrderOfPlay,
  listScheduled,
  listUnscheduled
} from '../../services/schedule.service'
import {
  autoSchedule,
  setNotBeforeHard,
  buildQueue
} from '../../services/scheduler.service'
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

  ipcMain.handle('schedule:getOrderOfPlay', (_e, tournamentId: string, date: string) =>
    getOrderOfPlay(getDb(), tournamentId, date)
  )

  ipcMain.handle('schedule:listScheduled', (_e, tournamentId: string) =>
    listScheduled(getDb(), tournamentId)
  )

  ipcMain.handle('schedule:listUnscheduled', (_e, tournamentId: string) =>
    listUnscheduled(getDb(), tournamentId)
  )

  ipcMain.handle('schedule:autoSchedule', (_e, tournamentId: string) =>
    autoSchedule(getDb(), tournamentId)
  )

  ipcMain.handle('schedule:setNotBeforeHard', (_e, matchId: string, datetime: string | null) =>
    setNotBeforeHard(getDb(), matchId, datetime)
  )

  ipcMain.handle('schedule:buildQueue', (_e, tournamentId: string) =>
    buildQueue(getDb(), tournamentId)
  )
}
