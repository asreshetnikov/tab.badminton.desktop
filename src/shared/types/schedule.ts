export interface MatchSlot {
  id: string
  scheduledAt: string | null
  courtId: string | null
  courtName: string | null
  team1Id: string | null
  team1Name: string | null
  team2Id: string | null
  team2Name: string | null
  status: string
  s1: number | null
  s2: number | null
  sets: { s1: number; s2: number }[]
  winnerTeamId: string | null
  eventId: string
  eventName: string
  eventCategory: string
  roundId: string
  roundName: string
  roundType: string
  /** Position of the round within its event (for sorting) */
  roundOrder: number
  /** Tour number for round_robin matches; null for playoff */
  tour: number | null
  /** Bracket round for playoff matches: 1 = first round, increasing toward final; null for round_robin */
  bracketRound: number | null
  /** Computed soft not-before constraint (ISO datetime) */
  notBeforeSoft: string | null
  /** Manually set hard not-before constraint (ISO datetime) */
  notBeforeHard: string | null
  /** Actual start time (ISO datetime) */
  actualStart: string | null
  /** Actual end time (ISO datetime) */
  actualEnd: string | null
  /** Scheduling priority: higher = schedule sooner */
  priority: number | null
  /** Manual queue order (lower = earlier in the queue); null = not yet assigned */
  queuePosition: number | null
  /** Left child match id (playoff): must be scheduled before this match */
  leftMatchId: string | null
  /** Right child match id (playoff): must be scheduled before this match */
  rightMatchId: string | null
}
