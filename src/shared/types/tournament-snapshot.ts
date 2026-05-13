import type { TournamentStatus } from './tournament'
import type { EventCategory } from './event'
import type { RoundType } from './round'
import type { MatchStatus } from './match'

export interface TournamentSnapshot {
  exportedAt: string
  tournament: {
    id: string
    name: string
    date_start: string
    date_end: string
    status: TournamentStatus
    venue: { name: string; address: string | null } | null
  }
  courts: Array<{ id: string; name: string }>
  events: SnapshotEvent[]
  players: SnapshotPlayer[]
}

export interface SnapshotPlayer {
  id: string
  first_name: string
  last_name: string
  club: string | null
}

export interface SnapshotEvent {
  id: string
  name: string
  category: EventCategory
  order: number
  rounds: SnapshotRound[]
}

export interface SnapshotRound {
  id: string
  name: string
  type: RoundType
  order: number
  teams: Array<{ id: string; name: string; player_ids: string[] }>
  matches: SnapshotMatch[]
  standings?: SnapshotStandingRow[]
}

export interface SnapshotMatch {
  id: string
  team1_id: string | null
  team2_id: string | null
  winner_id: string | null
  sets: Array<{ s1: number; s2: number }>
  status: MatchStatus
  scheduled_at: string | null
  court_id: string | null
  win_match_id: string | null
  left_match_id: string | null
  right_match_id: string | null
  tour: number | null
}

export interface SnapshotStandingRow {
  team_id: string
  wins: number
  losses: number
  sets_won: number
  sets_lost: number
  points_won: number
  points_lost: number
  position: number | null
}
