export const DEFAULT_START_TIME = '09:00'
export const DEFAULT_MATCH_DURATION = 60

export interface TournamentDaySetting {
  id: string
  tournament_id: string
  date: string         // YYYY-MM-DD
  start_time: string   // HH:MM
  match_duration: number // minutes
}

export interface UpsertTournamentDaySettingDTO {
  start_time: string
  match_duration: number
}
