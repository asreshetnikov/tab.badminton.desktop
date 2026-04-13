export type PlayerGender = 'M' | 'F'

export interface Player {
  id: string
  first_name: string
  last_name: string
  club: string | null
  gender: PlayerGender | null
}

export interface CreatePlayerDTO {
  first_name: string
  last_name: string
  club?: string | null
  gender?: PlayerGender | null
}

export interface UpdatePlayerDTO {
  first_name?: string
  last_name?: string
  club?: string | null
  gender?: PlayerGender | null
}
