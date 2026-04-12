import { registerPingHandler } from './handlers/ping.handler'
import { registerVenuesHandler } from './handlers/venues.handler'

export function registerIpcHandlers(): void {
  registerPingHandler()
  registerVenuesHandler()
}
