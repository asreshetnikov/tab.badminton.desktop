import type { TeamWithPlayers } from './team'

export interface TournamentTeam {
  id: string
  tournament_id: string
  event_id: string
  team_id: string
}

export interface TournamentTeamWithTeam extends TournamentTeam {
  team: TeamWithPlayers
}
