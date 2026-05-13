import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2, Users, Shield, ListTree, CalendarClock, Play, Activity } from 'lucide-react'
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
import { DaySettingsList } from '@renderer/features/tournament/DaySettingsList'
import { TournamentChecklist } from '@renderer/features/tournament/TournamentChecklist'
import { formatDate } from '@renderer/lib/format'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { useAppSettings } from '@renderer/contexts/AppSettingsContext'
import { PublishPanel } from '@renderer/features/tournament/PublishPanel'
import type { Tournament, Venue, CreateTournamentDTO } from '@shared/types/ipc'

interface TabCounts {
  players: number
  entries: number
  rounds: number
  matches: number
}

export function TournamentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { settings } = useAppSettings()
  const [tournament, setTournament] = useState<Tournament | undefined>()
  const [venue, setVenue] = useState<Venue | undefined>()
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulateMsg, setSimulateMsg] = useState<string | null>(null)
  const [counts, setCounts] = useState<TabCounts | null>(null)
  const [hasAcceptedPlayers, setHasAcceptedPlayers] = useState(false)
  const [checklistRefreshKey, setChecklistRefreshKey] = useState(0)

  useEffect(() => {
    if (id) api.tournament.getById(id).then(setTournament)
  }, [id])

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.tournamentPlayers.listByTournament(id),
      api.tournamentTeams.listByTournament(id),
      api.events.listByTournament(id),
      api.schedule.listScheduled(id),
      api.schedule.listUnscheduled(id),
    ]).then(async ([players, entries, events, scheduled, unscheduled]) => {
      const roundsArr = await Promise.all(events.map((e) => api.rounds.listByEvent(e.id)))
      setCounts({
        players: players.length,
        entries: entries.length,
        rounds: roundsArr.flat().length,
        matches: scheduled.length + unscheduled.length,
      })
      setHasAcceptedPlayers(players.some((p) => p.status === 'accepted'))
    })
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

  async function handleSimulate() {
    if (!tournament) return
    setIsSimulating(true)
    setSimulateMsg(null)
    try {
      const result = await api.tournaments.simulate(tournament.id)
      setSimulateMsg(`Simulated ${result.matchesPlayed} matches.${result.remaining > 0 ? ` ${result.remaining} unscheduled remain.` : ''}`)
    } catch (err) {
      setSimulateMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsSimulating(false)
    }
  }

  function handleEditClose() {
    setIsEditing(false)
    setChecklistRefreshKey((k) => k + 1)
  }

  async function handleUpdate(data: CreateTournamentDTO) {
    if (!tournament) return
    setIsSubmitting(true)
    try {
      const updated = await api.tournament.update(tournament.id, data)
      setTournament(updated)
      handleEditClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!tournament) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await api.tournament.delete(tournament.id)
      navigate('/')
    } catch (err) {
      setDeleteError(t('tournamentDetail.deleteErrorAccepted'))
    } finally {
      setIsDeleting(false)
    }
  }

  if (isEditing) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleEditClose}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">{t('tournamentEdit.title')}</h1>
        </div>
        <TournamentForm
          defaultValues={tournament}
          submitLabel={t('tournamentEdit.submit')}
          isSubmitting={isSubmitting}
          onSubmit={handleUpdate}
          onCancel={handleEditClose}
        />
        <CourtList tournamentId={tournament.id} />
        <DaySettingsList
          tournamentId={tournament.id}
          dateStart={tournament.date_start}
          dateEnd={tournament.date_end}
        />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Row 1: title + actions */}
      <div className="mb-3 flex items-center gap-3">
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
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} title={t('common.edit')}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)} title={t('common.delete')} disabled={hasAcceptedPlayers}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Row 2: section navigation */}
      <div className="mb-6 ml-11 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate(`/tournaments/${tournament.id}/players`)}>
          <Users className="mr-1.5 h-3.5 w-3.5" />
          {t('registrations.title')}
          {counts != null && (
            <span className="ml-1.5 text-xs text-muted-foreground">{counts.players}</span>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/tournaments/${tournament.id}/teams`)}>
          <Shield className="mr-1.5 h-3.5 w-3.5" />
          {t('tournamentTeams.title')}
          {counts != null && (
            <span className="ml-1.5 text-xs text-muted-foreground">{counts.entries}</span>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/tournaments/${tournament.id}/rounds`)}>
          <ListTree className="mr-1.5 h-3.5 w-3.5" />
          {t('rounds.title')}
          {counts != null && (
            <span className="ml-1.5 text-xs text-muted-foreground">{counts.rounds}</span>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/tournaments/${tournament.id}/schedule`)}>
          <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
          {t('schedule.title')}
          {counts != null && (
            <span className="ml-1.5 text-xs text-muted-foreground">{counts.matches}</span>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/tournaments/${tournament.id}/activity`)}>
          <Activity className="mr-1.5 h-3.5 w-3.5" />
          {t('activity.title')}
        </Button>
        {settings.demoMode && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSimulate}
            disabled={isSimulating}
            className="ml-auto border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {isSimulating ? 'Simulating…' : 'Simulate'}
          </Button>
        )}
      </div>
      {simulateMsg && (
        <p className="mb-4 ml-11 text-sm text-muted-foreground">{simulateMsg}</p>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="font-medium text-muted-foreground">{t('tournamentDetail.venue')}</dt>
        <dd>{venue?.name ?? t('tournamentDetail.noVenue')}</dd>

        <dt className="font-medium text-muted-foreground">{t('tournamentDetail.dateStart')}</dt>
        <dd>{formatDate(tournament.date_start)}</dd>

        <dt className="font-medium text-muted-foreground">{t('tournamentDetail.dateEnd')}</dt>
        <dd>{formatDate(tournament.date_end)}</dd>

        {(tournament.age_min != null || tournament.age_max != null) && (
          <>
            <dt className="font-medium text-muted-foreground">{t('tournamentDetail.ageRestriction')}</dt>
            <dd>
              {tournament.age_min != null && tournament.age_max == null
                ? `${tournament.age_min}+`
                : tournament.age_max != null && tournament.age_min == null
                  ? `U${tournament.age_max + 1}`
                  : `${tournament.age_min}–${tournament.age_max}`}
            </dd>
          </>
        )}
      </dl>

      <PublishPanel tournamentId={tournament.id} />

      <EventList
        tournamentId={tournament.id}
        defaultAgeMin={tournament.age_min}
        defaultAgeMax={tournament.age_max}
        onEventsChange={() => setChecklistRefreshKey((k) => k + 1)}
      />

      <TournamentChecklist
        tournament={tournament}
        onEdit={() => setIsEditing(true)}
        refreshKey={checklistRefreshKey}
      />

      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteError(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tournamentDetail.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('tournamentDetail.deleteDescription', { name: tournament.name })}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
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
