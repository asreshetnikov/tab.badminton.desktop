import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { TournamentForm } from '@renderer/features/tournament/TournamentForm'
import { api } from '@renderer/lib/api'
import { useTournamentStore } from '@renderer/lib/store/tournament.store'
import type { CreateTournamentDTO } from '@shared/types/ipc'

export function TournamentNew() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { load } = useTournamentStore()
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(data: CreateTournamentDTO) {
    setIsSubmitting(true)
    try {
      const tournament = await api.tournament.create(data)
      await load()
      navigate(`/tournaments/${tournament.id}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">{t('tournamentNew.title')}</h1>
      </div>

      <div className="max-w-lg">
        <TournamentForm
          submitLabel={t('tournamentNew.submit')}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/')}
        />
      </div>
    </div>
  )
}
