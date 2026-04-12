import { useNavigate } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'
import { statusClass } from './status'
import { formatDate } from '@renderer/lib/format'
import type { Tournament } from '@shared/types/ipc'

interface Props {
  tournament: Tournament
}

export function TournamentCard({ tournament }: Props) {
  const navigate = useNavigate()
  const { t } = useTranslation()

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
            {t(`tournament.status.${tournament.status}`)}
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
