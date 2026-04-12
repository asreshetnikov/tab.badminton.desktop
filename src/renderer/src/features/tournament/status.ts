import type { TournamentStatus } from '@shared/types/tournament'

export const statusClass: Record<TournamentStatus, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  registration_open: 'bg-blue-100 text-blue-800',
  registration_closed: 'bg-orange-100 text-orange-800',
  in_progress: 'bg-green-100 text-green-800',
  finished: 'bg-muted text-muted-foreground'
}
