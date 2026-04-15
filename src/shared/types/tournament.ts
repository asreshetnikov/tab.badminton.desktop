export type TournamentStatus =
  | 'draft'
  | 'registration_open'
  | 'registration_closed'
  | 'in_progress'
  | 'finished'

export interface Tournament {
  id: string
  name: string
  date_start: string
  date_end: string
  venue_id: string | null
  status: TournamentStatus
  age_min: number | null
  age_max: number | null
  created_at: string
  updated_at: string
}

export interface CreateTournamentDTO {
  name: string
  date_start: string
  date_end: string
  venue_id?: string | null
  status?: TournamentStatus
  age_min?: number | null
  age_max?: number | null
}

export interface UpdateTournamentDTO {
  name?: string
  date_start?: string
  date_end?: string
  venue_id?: string | null
  status?: TournamentStatus
  age_min?: number | null
  age_max?: number | null
}
