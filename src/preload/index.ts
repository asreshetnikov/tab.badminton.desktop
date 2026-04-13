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
  }
}

contextBridge.exposeInMainWorld('api', api)
