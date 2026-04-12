import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { useTournamentStore } from '@renderer/lib/store/tournament.store'
import { TournamentCard } from '@renderer/features/tournament/TournamentCard'

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="rounded-full bg-muted p-4">
        <Trophy className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">{t('dashboard.empty.title')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.empty.description')}</p>
      </div>
      <Button onClick={onCreateClick}>
        <Plus />
        {t('dashboard.newTournament')}
      </Button>
    </div>
  )
}

export function Dashboard() {
  const { t } = useTranslation()
  const { tournaments, isLoading, load } = useTournamentStore()
  const navigate = useNavigate()

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('dashboard.title')}</h1>
        <Button onClick={() => navigate('/tournaments/new')}>
          <Plus />
          {t('dashboard.newTournament')}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-24 text-center text-sm text-muted-foreground">{t('dashboard.loading')}</div>
      ) : tournaments.length === 0 ? (
        <EmptyState onCreateClick={() => navigate('/tournaments/new')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </div>
      )}
    </div>
  )
}
