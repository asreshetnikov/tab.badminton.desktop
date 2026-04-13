export type RoundType = 'round_robin' | 'playoff'

export interface Round {
  id: string
  event_id: string
  name: string
  type: RoundType
  order: number
  qualification_rule: string | null
}

export interface CreateRoundDTO {
  event_id: string
  name: string
  type: RoundType
}

export interface UpdateRoundDTO {
  name?: string
  type?: RoundType
}
