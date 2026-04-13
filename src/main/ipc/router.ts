import { registerPingHandler } from './handlers/ping.handler'
import { registerVenuesHandler } from './handlers/venues.handler'
import { registerTournamentHandler } from './handlers/tournament.handler'
import { registerCourtsHandler } from './handlers/courts.handler'
import { registerEventsHandler } from './handlers/events.handler'
import { registerPlayersHandler } from './handlers/players.handler'
import { registerTeamsHandler } from './handlers/teams.handler'
import { registerTournamentPlayersHandler } from './handlers/tournament-players.handler'
import { registerTournamentTeamsHandler } from './handlers/tournament-teams.handler'
import { registerRoundsHandler } from './handlers/rounds.handler'
import { registerRoundTeamsHandler } from './handlers/round-teams.handler'
import { registerMatchesHandler } from './handlers/matches.handler'

export function registerIpcHandlers(): void {
  registerPingHandler()
  registerVenuesHandler()
  registerTournamentHandler()
  registerCourtsHandler()
  registerEventsHandler()
  registerPlayersHandler()
  registerTeamsHandler()
  registerTournamentPlayersHandler()
  registerTournamentTeamsHandler()
  registerRoundsHandler()
  registerRoundTeamsHandler()
  registerMatchesHandler()
}
