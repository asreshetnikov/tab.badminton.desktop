import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { statusClass } from '@renderer/features/tournament/status'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import type { Tournament } from '@shared/types/ipc'

export function TournamentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [tournament, setTournament] = useState<Tournament | undefined>()

  useEffect(() => {
    if (id) api.tournament.getById(id).then(setTournament)
  }, [id])

  if (!tournament) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">{tournament.name}</h1>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            statusClass[tournament.status]
          )}
        >
          {t(`tournament.status.${tournament.status}`)}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        {/* Full tournament management UI coming in the next step */}
        Tournament overview — coming soon.
      </p>
    </div>
  )
}
