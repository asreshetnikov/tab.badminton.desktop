import type { TeamWithPlayers } from './team'

export interface TournamentTeam {
  id: string
  tournament_id: string
  event_id: string
  team_id: string
  seed_lo: number | null
  seed_hi: number | null
}

export interface TournamentTeamWithTeam extends TournamentTeam {
  team: TeamWithPlayers
}
