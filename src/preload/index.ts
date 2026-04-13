import { contextBridge, ipcRenderer } from 'electron'
import type { AppAPI } from '../shared/types/ipc'

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
    delete: (id) => ipcRenderer.invoke('events:delete', id)
  },

  tournamentPlayers: {
    register: (tournamentId, playerId) => ipcRenderer.invoke('tournamentPlayers:register', tournamentId, playerId),
    registerMany: (tournamentId, playerIds) => ipcRenderer.invoke('tournamentPlayers:registerMany', tournamentId, playerIds),
    listByTournament: (tournamentId) => ipcRenderer.invoke('tournamentPlayers:listByTournament', tournamentId),
    updateStatus: (id, status) => ipcRenderer.invoke('tournamentPlayers:updateStatus', id, status),
    remove: (id) => ipcRenderer.invoke('tournamentPlayers:remove', id)
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
  }
}

contextBridge.exposeInMainWorld('api', api)
