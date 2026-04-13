export type MatchStatus = 'scheduled' | 'in_progress' | 'finished' | 'walkover' | 'retired'

export interface MatchSet {
  id: string
  match_id: string
  order: number
  s1: number
  s2: number
}

export interface SetScore {
  s1: number
  s2: number
}

export interface UpdateMatchResultDTO {
  status: MatchStatus
  sets: SetScore[]
  /** Required when status is 'walkover' */
  winner_team_id?: string | null
}

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
  sets: MatchSet[]
}
