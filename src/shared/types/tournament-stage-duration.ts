export interface TournamentStageDuration {
  id: string
  tournament_id: string
  bracket_round: number
  duration_minutes: number
}

export interface UpsertStageDurationDTO {
  duration_minutes: number
}
