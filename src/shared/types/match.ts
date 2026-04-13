export type MatchStatus = 'scheduled' | 'in_progress' | 'finished' | 'walkover' | 'retired'

export interface Match {
  id: string
  round_id: string
  team1_id: string | null
  team2_id: string | null
  winner_team_id: string | null
  s1: number | null
  s2: number | null
  status: MatchStatus
  scheduled_at: string | null
  court_id: string | null
  win_match_id: string | null
  left_match_id: string | null
  right_match_id: string | null
  tour: number | null
}

export interface MatchWithTeams extends Match {
  team1: { id: string; name: string } | null
  team2: { id: string; name: string } | null
}
