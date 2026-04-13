import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2, Users, Shield } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { api } from '@renderer/lib/api'
import { statusClass } from '@renderer/features/tournament/status'
import { TournamentForm } from '@renderer/features/tournament/TournamentForm'
import { CourtList } from '@renderer/features/court/CourtList'
import { EventList } from '@renderer/features/event/EventList'
import { formatDate } from '@renderer/lib/format'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import type { Tournament, Venue, CreateTournamentDTO } from '@shared/types/ipc'

export function TournamentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [tournament, setTournament] = useState<Tournament | undefined>()
  const [venue, setVenue] = useState<Venue | undefined>()
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (id) api.tournament.getById(id).then(setTournament)
  }, [id])

  useEffect(() => {
    if (tournament?.venue_id) {
      api.venues.getById(tournament.venue_id).then(setVenue)
    } else {
      setVenue(undefined)
    }
  }, [tournament?.venue_id])

  if (!tournament) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  async function handleUpdate(data: CreateTournamentDTO) {
    if (!tournament) return
    setIsSubmitting(true)
    try {
      const updated = await api.tournament.update(tournament.id, data)
      setTournament(updated)
      setIsEditing(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!tournament) return
    setIsDeleting(true)
    try {
      await api.tournament.delete(tournament.id)
      navigate('/')
    } finally {
      setIsDeleting(false)
    }
  }

  if (isEditing) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setIsEditing(false)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">{t('tournamentEdit.title')}</h1>
        </div>
        <TournamentForm
          defaultValues={tournament}
          submitLabel={t('tournamentEdit.submit')}
          isSubmitting={isSubmitting}
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    )
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
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/tournaments/${tournament.id}/players`)}>
            <Users className="mr-1.5 h-3.5 w-3.5" />
            {t('registrations.title')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/tournaments/${tournament.id}/teams`)}>
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            {t('tournamentTeams.title')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {t('common.edit')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" />
            <span className="text-destructive">{t('common.delete')}</span>
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="font-medium text-muted-foreground">{t('tournamentDetail.venue')}</dt>
        <dd>{venue?.name ?? t('tournamentDetail.noVenue')}</dd>

        <dt className="font-medium text-muted-foreground">{t('tournamentDetail.dateStart')}</dt>
        <dd>{formatDate(tournament.date_start)}</dd>

        <dt className="font-medium text-muted-foreground">{t('tournamentDetail.dateEnd')}</dt>
        <dd>{formatDate(tournament.date_end)}</dd>
      </dl>

      <EventList tournamentId={tournament.id} />

      <CourtList tournamentId={tournament.id} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tournamentDetail.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('tournamentDetail.deleteDescription', { name: tournament.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
