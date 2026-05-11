import { contextBridge, ipcRenderer } from 'electron'
import type { AppAPI, AssignSlotDTO } from '../shared/types/ipc'
import type { UpsertTournamentDaySettingDTO } from '../shared/types/tournament-day-settings'
import type { UpsertStageDurationDTO } from '../shared/types/tournament-stage-duration'

const api: AppAPI = {
  ping: () => ipcRenderer.invoke('ping'),

  venues: {
    create: (data) => ipcRenderer.invoke('venues:create', data),
    getById: (id) => ipcRenderer.invoke('venues:getById', id),
    list: () => ipcRenderer.invoke('venues:list'),
    update: (id, data) => ipcRenderer.invoke('venues:update', id, data),
    delete: (id) => ipcRenderer.invoke('venues:delete', id)
  },

  tournament: {
    create: (data) => ipcRenderer.invoke('tournament:create', data),
    getById: (id) => ipcRenderer.invoke('tournament:getById', id),
    list: () => ipcRenderer.invoke('tournament:list'),
    update: (id, data) => ipcRenderer.invoke('tournament:update', id, data),
    delete: (id) => ipcRenderer.invoke('tournament:delete', id)
  },

  courts: {
    create: (data) => ipcRenderer.invoke('courts:create', data),
    listByTournament: (tournamentId) => ipcRenderer.invoke('courts:listByTournament', tournamentId),
    update: (id, data) => ipcRenderer.invoke('courts:update', id, data),
    delete: (id) => ipcRenderer.invoke('courts:delete', id)
  },

  events: {
    create: (data) => ipcRenderer.invoke('events:create', data),
    listByTournament: (tournamentId) => ipcRenderer.invoke('events:listByTournament', tournamentId),
    update: (id, data) => ipcRenderer.invoke('events:update', id, data),
    delete: (id) => ipcRenderer.invoke('events:delete', id),
    reorder: (ids) => ipcRenderer.invoke('events:reorder', ids)
  },

  tournamentTeams: {
    add: (tournamentId, eventId, teamId) => ipcRenderer.invoke('tournamentTeams:add', tournamentId, eventId, teamId),
    addMany: (tournamentId, eventId, teamIds) => ipcRenderer.invoke('tournamentTeams:addMany', tournamentId, eventId, teamIds),
    listByTournament: (tournamentId) => ipcRenderer.invoke('tournamentTeams:listByTournament', tournamentId),
    setSeed: (tournamentTeamId, lo, hi) => ipcRenderer.invoke('tournamentTeams:setSeed', tournamentTeamId, lo, hi),
    remove: (id) => ipcRenderer.invoke('tournamentTeams:remove', id)
  },

  tournamentPlayers: {
    register: (tournamentId, playerId) => ipcRenderer.invoke('tournamentPlayers:register', tournamentId, playerId),
    registerMany: (tournamentId, playerIds) => ipcRenderer.invoke('tournamentPlayers:registerMany', tournamentId, playerIds),
    listByTournament: (tournamentId) => ipcRenderer.invoke('tournamentPlayers:listByTournament', tournamentId),
    updateStatus: (id, status) => ipcRenderer.invoke('tournamentPlayers:updateStatus', id, status),
    remove: (id) => ipcRenderer.invoke('tournamentPlayers:remove', id),
    getPlayerActivity: (tournamentId) =>
      ipcRenderer.invoke('tournamentPlayers:getPlayerActivity', tournamentId)
  },

  rounds: {
    create: (data) => ipcRenderer.invoke('rounds:create', data),
    listByEvent: (eventId) => ipcRenderer.invoke('rounds:listByEvent', eventId),
    update: (id, data) => ipcRenderer.invoke('rounds:update', id, data),
    delete: (id) => ipcRenderer.invoke('rounds:delete', id)
  },

  roundTeams: {
    add: (roundId, teamId) => ipcRenderer.invoke('roundTeams:add', roundId, teamId),
    addMany: (roundId, teamIds) => ipcRenderer.invoke('roundTeams:addMany', roundId, teamIds),
    listByRound: (roundId) => ipcRenderer.invoke('roundTeams:listByRound', roundId),
    listTableByRound: (roundId) => ipcRenderer.invoke('roundTeams:listTableByRound', roundId),
    draw: (roundId) => ipcRenderer.invoke('roundTeams:draw', roundId),
    remove: (id) => ipcRenderer.invoke('roundTeams:remove', id)
  },

  matches: {
    getById: (matchId) => ipcRenderer.invoke('matches:getById', matchId),
    generate: (roundId) => ipcRenderer.invoke('matches:generate', roundId),
    generatePlayoff: (roundId) => ipcRenderer.invoke('matches:generatePlayoff', roundId),
    listByRound: (roundId) => ipcRenderer.invoke('matches:listByRound', roundId),
    deleteByRound: (roundId) => ipcRenderer.invoke('matches:deleteByRound', roundId),
    regenerateForTournament: (tournamentId) => ipcRenderer.invoke('matches:regenerateForTournament', tournamentId),
    startMatch: (matchId, actualStart) => ipcRenderer.invoke('matches:startMatch', matchId, actualStart),
    updateResult: (matchId, dto) => ipcRenderer.invoke('matches:updateResult', matchId, dto)
  },

  teams: {
    create: (data) => ipcRenderer.invoke('teams:create', data),
    list: () => ipcRenderer.invoke('teams:list'),
    update: (id, data) => ipcRenderer.invoke('teams:update', id, data),
    delete: (id) => ipcRenderer.invoke('teams:delete', id)
  },

  players: {
    create: (data) => ipcRenderer.invoke('players:create', data),
    getById: (id) => ipcRenderer.invoke('players:getById', id),
    list: () => ipcRenderer.invoke('players:list'),
    update: (id, data) => ipcRenderer.invoke('players:update', id, data),
    delete: (id) => ipcRenderer.invoke('players:delete', id),
    importCSV: () => ipcRenderer.invoke('players:importCSV')
  },

  tournamentDaySettings: {
    listByTournament: (tournamentId: string) =>
      ipcRenderer.invoke('tournamentDaySettings:listByTournament', tournamentId),
    upsert: (tournamentId: string, date: string, dto: UpsertTournamentDaySettingDTO) =>
      ipcRenderer.invoke('tournamentDaySettings:upsert', tournamentId, date, dto),
    delete: (id: string) => ipcRenderer.invoke('tournamentDaySettings:delete', id)
  },

  schedule: {
    assignSlot: (matchId: string, dto: AssignSlotDTO) =>
      ipcRenderer.invoke('schedule:assignSlot', matchId, dto),
    validateConflicts: (matchId: string, params: { teamId: string; datetime: string; duration: number }) =>
      ipcRenderer.invoke('schedule:validateConflicts', matchId, params),
    getOrderOfPlay: (tournamentId: string, date: string) =>
      ipcRenderer.invoke('schedule:getOrderOfPlay', tournamentId, date),
    listScheduled: (tournamentId: string) =>
      ipcRenderer.invoke('schedule:listScheduled', tournamentId),
    listUnscheduled: (tournamentId: string) =>
      ipcRenderer.invoke('schedule:listUnscheduled', tournamentId),
    autoSchedule: (tournamentId: string) =>
      ipcRenderer.invoke('schedule:autoSchedule', tournamentId),
    setNotBeforeHard: (matchId: string, datetime: string | null) =>
      ipcRenderer.invoke('schedule:setNotBeforeHard', matchId, datetime),
    buildQueue: (tournamentId: string) =>
      ipcRenderer.invoke('schedule:buildQueue', tournamentId),
    setQueuePositions: (positions: Array<{ matchId: string; position: number }>) =>
      ipcRenderer.invoke('schedule:setQueuePositions', positions)
  },

  stageDurations: {
    list: (tournamentId: string) =>
      ipcRenderer.invoke('stageDurations:list', tournamentId),
    upsert: (tournamentId: string, bracketRound: number, dto: UpsertStageDurationDTO) =>
      ipcRenderer.invoke('stageDurations:upsert', tournamentId, bracketRound, dto),
    delete: (id: string) =>
      ipcRenderer.invoke('stageDurations:delete', id)
  },

  appSettings: {
    get: () => ipcRenderer.invoke('appSettings:get'),
    set: (settings: Partial<{ demoMode: boolean }>) => ipcRenderer.invoke('appSettings:set', settings)
  },

  tournaments: {
    simulate: (tournamentId: string) => ipcRenderer.invoke('tournaments:simulate', tournamentId)
  }
}

contextBridge.exposeInMainWorld('api', api)
