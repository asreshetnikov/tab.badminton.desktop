import { contextBridge, ipcRenderer } from 'electron'
import type { AppAPI } from '../shared/types/ipc'

const api: AppAPI = {
  ping: () => ipcRenderer.invoke('ping')
}

contextBridge.exposeInMainWorld('api', api)
