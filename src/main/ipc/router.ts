import { registerPingHandler } from './handlers/ping.handler'
import { registerVenuesHandler } from './handlers/venues.handler'
import { registerTournamentHandler } from './handlers/tournament.handler'
import { registerCourtsHandler } from './handlers/courts.handler'

export function registerIpcHandlers(): void {
  registerPingHandler()
  registerVenuesHandler()
  registerTournamentHandler()
  registerCourtsHandler()
}
