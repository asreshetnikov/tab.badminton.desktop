export interface RoundTeam {
  id: string
  round_id: string
  team_id: string
  status: 'active' | 'withdrawn'
  seed: number | null
  checked_in: boolean
}

export interface RoundTeamWithTeam extends RoundTeam {
  team: { id: string; name: string; category: string }
}

export interface RoundTableRow {
  id: string
  round_id: string
  team_id: string
  wins: number
  losses: number
  sets_won: number
  sets_lost: number
  points_won: number
  points_lost: number
  position: number | null
}

export interface RoundTableRowWithTeam extends RoundTableRow {
  team: { id: string; name: string }
}
