import type { Player } from './player'

export type RegistrationStatus = 'pending' | 'accepted' | 'rejected'

export interface TournamentPlayer {
  id: string
  tournament_id: string
  player_id: string
  status: RegistrationStatus
  registered_at: string
}

export interface TournamentPlayerWithPlayer extends TournamentPlayer {
  player: Pick<Player, 'id' | 'first_name' | 'last_name' | 'club'>
}
