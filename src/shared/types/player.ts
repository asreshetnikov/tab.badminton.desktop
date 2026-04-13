export interface Player {
  id: string
  first_name: string
  last_name: string
  club: string | null
}

export interface CreatePlayerDTO {
  first_name: string
  last_name: string
  club?: string | null
}

export interface UpdatePlayerDTO {
  first_name?: string
  last_name?: string
  club?: string | null
}
