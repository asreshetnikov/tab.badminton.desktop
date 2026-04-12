/// <reference types="vite/client" />

import type { AppAPI } from '@shared/types/ipc'

declare global {
  interface Window {
    api: AppAPI
  }
}
