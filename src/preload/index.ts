import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Expose electron APIs to renderer
// Custom APIs will be added here as features are implemented
contextBridge.exposeInMainWorld('electron', electronAPI)
