import type { EventCategory } from './event'
import type { Player } from './player'

export interface Team {
  id: string
  name: string
  category: EventCategory
  is_demo: boolean
}

export interface TeamWithPlayers extends Team {
  players: Pick<Player, 'id' | 'first_name' | 'last_name' | 'club'>[]
}

export interface CreateTeamDTO {
  name: string
  category: EventCategory
  player_ids: [string] | [string, string]
}
