export type PlayerGender = 'M' | 'F'

export interface Player {
  id: string
  first_name: string
  last_name: string
  club: string | null
  gender: PlayerGender | null
  birth_year: number | null
  is_demo: boolean
}

export interface CreatePlayerDTO {
  first_name: string
  last_name: string
  club?: string | null
  gender?: PlayerGender | null
  birth_year?: number | null
}

export interface UpdatePlayerDTO {
  first_name?: string
  last_name?: string
  club?: string | null
  gender?: PlayerGender | null
  birth_year?: number | null
}
