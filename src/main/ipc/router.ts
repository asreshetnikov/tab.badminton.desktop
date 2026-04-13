import { registerPingHandler } from './handlers/ping.handler'
import { registerVenuesHandler } from './handlers/venues.handler'
import { registerTournamentHandler } from './handlers/tournament.handler'
import { registerCourtsHandler } from './handlers/courts.handler'
import { registerEventsHandler } from './handlers/events.handler'
import { registerPlayersHandler } from './handlers/players.handler'

export function registerIpcHandlers(): void {
  registerPingHandler()
  registerVenuesHandler()
  registerTournamentHandler()
  registerCourtsHandler()
  registerEventsHandler()
  registerPlayersHandler()
}
