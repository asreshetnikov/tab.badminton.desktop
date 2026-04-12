import { registerPingHandler } from './handlers/ping.handler'
import { registerVenuesHandler } from './handlers/venues.handler'
import { registerTournamentHandler } from './handlers/tournament.handler'

export function registerIpcHandlers(): void {
  registerPingHandler()
  registerVenuesHandler()
  registerTournamentHandler()
}
