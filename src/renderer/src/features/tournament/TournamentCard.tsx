import { useNavigate } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'
import { statusLabel, statusClass } from './status'
import type { Tournament } from '@shared/types/ipc'

interface Props {
  tournament: Tournament
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function TournamentCard({ tournament }: Props) {
  const navigate = useNavigate()

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => navigate(`/tournaments/${tournament.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{tournament.name}</CardTitle>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
              statusClass[tournament.status]
            )}
          >
            {statusLabel[tournament.status]}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>
            {formatDate(tournament.date_start)} — {formatDate(tournament.date_end)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
