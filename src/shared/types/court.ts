export interface Court {
  id: string
  tournament_id: string
  name: string
}

export interface CreateCourtDTO {
  tournament_id: string
  name: string
}

export interface UpdateCourtDTO {
  name?: string
}
