import { registerPingHandler } from './handlers/ping.handler'

export function registerIpcHandlers(): void {
  registerPingHandler()
}
