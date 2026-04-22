import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { api } from '@renderer/lib/api'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { statusClass } from '@renderer/features/tournament/status'
import type {
  Tournament,
  Event,
  Round,
  RoundType,
  EventCategory,
  RoundTeamWithTeam,
  TournamentTeamWithTeam
} from '@shared/types/ipc'

const ROUND_TYPE_OPTIONS: { value: RoundType; labelKey: string }[] = [
  { value: 'round_robin', labelKey: 'rounds.type.round_robin' },
  { value: 'playoff', labelKey: 'rounds.type.playoff' }
]

function AddRoundForm({
  order,
  isSaving,
  onSave,
  onCancel,
  t
}: {
  order: number
  isSaving: boolean
  onSave: (name: string, type: RoundType, allEntries: boolean) => void
  onCancel: () => void
  t: (key: string) => string
}) {
  const [name, setName] = useState('Main Draw')
  const [type, setType] = useState<RoundType>('playoff')
  const [allEntries, setAllEntries] = useState(false)

  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2">
      <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground">{order}.</span>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSave(name.trim(), type, allEntries)
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={t('rounds.namePlaceholder')}
        autoFocus
        className="h-7 flex-1 text-sm"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as RoundType)}
        className="h-7 shrink-0 rounded-md border border-input bg-background px-2 text-xs"
      >
        {ROUND_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={allEntries}
          onChange={(e) => setAllEntries(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        {t('rounds.allEntries')}
      </label>
      <Button
        size="sm"
        className="h-7 shrink-0 text-xs"
        disabled={!name.trim() || isSaving}
        onClick={() => name.trim() && onSave(name.trim(), type, allEntries)}
      >
        {t('rounds.add')}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  )
}

export function TournamentRounds() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()

  const [tournament, setTournament] = useState<Tournament | undefined>()
  const [events, setEvents] = useState<Event[]>([])
  const [roundsByEvent, setRoundsByEvent] = useState<Record<string, Round[]>>({})
  const [tournamentTeamsByEvent, setTournamentTeamsByEvent] = useState<Record<string, TournamentTeamWithTeam[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [addingEventId, setAddingEventId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | null>(null)

  // Per-round entries count (shown in header)
  const [roundTeamCounts, setRoundTeamCounts] = useState<Record<string, number>>({})

  // Expanded rounds: lazy-load full team data on first expand
  const [expandedRoundIds, setExpandedRoundIds] = useState<Set<string>>(new Set())
  const [roundTeamsData, setRoundTeamsData] = useState<Record<string, RoundTeamWithTeam[]>>({})

  // Add-entries picker state
  const [addingToRoundId, setAddingToRoundId] = useState<string | null>(null)
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set())
  const [isAddingTeams, setIsAddingTeams] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.tournament.getById(id),
      api.events.listByTournament(id),
      api.tournamentTeams.listByTournament(id)
    ]).then(async ([tournament, events, allTournamentTeams]) => {
      setTournament(tournament)
      setEvents(events)

      const byEvent: Record<string, TournamentTeamWithTeam[]> = {}
      for (const tt of allTournamentTeams) {
        if (!byEvent[tt.event_id]) byEvent[tt.event_id] = []
        byEvent[tt.event_id].push(tt)
      }
      setTournamentTeamsByEvent(byEvent)

      const roundEntries = await Promise.all(
        events.map((e) => api.rounds.listByEvent(e.id).then((rounds) => [e.id, rounds] as const))
      )
      setRoundsByEvent(Object.fromEntries(roundEntries))

      const allRounds = roundEntries.flatMap(([, rounds]) => rounds)
      const counts = await Promise.all(
        allRounds.map((r) => api.roundTeams.listByRound(r.id).then((rt) => [r.id, rt.length] as const))
      )
      setRoundTeamCounts(Object.fromEntries(counts))
      setIsLoading(false)

      const requestedEvent = searchParams.get('event')
      if (requestedEvent && events.some((e) => e.id === requestedEvent)) {
        setTimeout(() => {
          document.getElementById(`event-section-${requestedEvent}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 50)
      }
    })
  }, [id])

  async function toggleExpand(roundId: string) {
    setExpandedRoundIds((prev) => {
      const next = new Set(prev)
      if (next.has(roundId)) {
        next.delete(roundId)
        setAddingToRoundId((cur) => (cur === roundId ? null : cur))
      } else {
        next.add(roundId)
      }
      return next
    })
    if (!roundTeamsData[roundId]) {
      const teams = await api.roundTeams.listByRound(roundId)
      setRoundTeamsData((prev) => ({ ...prev, [roundId]: teams }))
    }
  }

  async function handleAdd(eventId: string, name: string, type: RoundType, allEntries: boolean) {
    setIsSaving(true)
    try {
      const round = await api.rounds.create({ event_id: eventId, name, type })
      let addedTeams: RoundTeamWithTeam[] = []
      if (allEntries) {
        const teamIds = (tournamentTeamsByEvent[eventId] ?? []).map((tt) => tt.team_id)
        if (teamIds.length > 0) {
          try {
            addedTeams = await api.roundTeams.addMany(round.id, teamIds)
          } catch (err) {
            alert(err instanceof Error ? err.message : String(err))
          }
        }
      }
      setRoundsByEvent((prev) => ({ ...prev, [eventId]: [...(prev[eventId] ?? []), round] }))
      setRoundTeamCounts((prev) => ({ ...prev, [round.id]: addedTeams.length }))
      setRoundTeamsData((prev) => ({ ...prev, [round.id]: addedTeams }))
      setAddingEventId(null)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteRound(round: Round) {
    await api.rounds.delete(round.id)
    setRoundsByEvent((prev) => ({
      ...prev,
      [round.event_id]: (prev[round.event_id] ?? []).filter((r) => r.id !== round.id)
    }))
  }

  async function handleAddTeams(roundId: string) {
    if (selectedToAdd.size === 0) return
    setIsAddingTeams(true)
    try {
      const added = await api.roundTeams.addMany(roundId, [...selectedToAdd])
      setRoundTeamsData((prev) => ({ ...prev, [roundId]: [...(prev[roundId] ?? []), ...added] }))
      setRoundTeamCounts((prev) => ({ ...prev, [roundId]: (prev[roundId] ?? 0) + added.length }))
      setSelectedToAdd(new Set())
      setAddingToRoundId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setIsAddingTeams(false)
    }
  }

  async function handleRemoveFromRound(rt: RoundTeamWithTeam) {
    await api.roundTeams.remove(rt.id)
    setRoundTeamsData((prev) => ({
      ...prev,
      [rt.round_id]: (prev[rt.round_id] ?? []).filter((r) => r.id !== rt.id)
    }))
    setRoundTeamCounts((prev) => ({ ...prev, [rt.round_id]: Math.max(0, (prev[rt.round_id] ?? 1) - 1) }))
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/tournaments/${id}`)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <p className="text-xs text-muted-foreground">{tournament?.name}</p>
          <h1 className="text-xl font-semibold">{t('rounds.title')}</h1>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
          <p className="font-medium">{t('rounds.noEvents')}</p>
          <p className="text-sm text-muted-foreground">{t('rounds.noEventsHint')}</p>
        </div>
      ) : (
        <>
          {/* Category filter */}
          {(() => {
            const presentCategories = [...new Set(events.map((e) => e.category))]
            if (presentCategories.length <= 1) return null
            return (
              <div className="mb-6 flex flex-wrap gap-1.5">
                {presentCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter((prev) => (prev === cat ? null : cat))}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                      categoryFilter === cat
                        ? statusClass[cat] ?? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )
          })()}

          <div className="space-y-8">
            {events.filter((e) => !categoryFilter || e.category === categoryFilter).map((event) => {
              const rounds = roundsByEvent[event.id] ?? []
              const isAdding = addingEventId === event.id

              return (
                <section key={event.id} id={`event-section-${event.id}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold',
                      statusClass[event.category] ?? 'bg-muted text-muted-foreground')}>
                      {event.category}
                    </span>
                    <h2 className="font-semibold">{event.name}</h2>
                    {!isAdding && rounds.length > 0 && (() => {
                      const allExpanded = rounds.every((r) => expandedRoundIds.has(r.id))
                      return (
                        <button
                          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                          onClick={async () => {
                            if (allExpanded) {
                              setExpandedRoundIds((prev) => {
                                const next = new Set(prev)
                                rounds.forEach((r) => next.delete(r.id))
                                return next
                              })
                            } else {
                              const toLoad = rounds.filter((r) => !roundTeamsData[r.id])
                              const loaded = await Promise.all(
                                toLoad.map((r) => api.roundTeams.listByRound(r.id).then((rt) => [r.id, rt] as const))
                              )
                              setRoundTeamsData((prev) => ({ ...prev, ...Object.fromEntries(loaded) }))
                              setExpandedRoundIds((prev) => {
                                const next = new Set(prev)
                                rounds.forEach((r) => next.add(r.id))
                                return next
                              })
                            }
                          }}
                        >
                          {allExpanded ? t('common.collapseAll') : t('common.expandAll')}
                        </button>
                      )
                    })()}
                    {!isAdding && (
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn('h-7 text-xs', rounds.length > 0 ? '' : 'ml-auto')}
                        onClick={() => setAddingEventId(event.id)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {t('rounds.add')}
                      </Button>
                    )}
                  </div>

                  <div className="space-y-1">
                    {rounds.length === 0 && !isAdding && (
                      <p className="text-sm text-muted-foreground">{t('rounds.empty.description')}</p>
                    )}

                    {rounds.map((round) => {
                      const isExpanded = expandedRoundIds.has(round.id)
                      const teams = roundTeamsData[round.id] ?? []
                      const roundTeamIds = new Set(teams.map((rt) => rt.team_id))
                      const eligible = (tournamentTeamsByEvent[event.id] ?? [])
                        .filter((tt) => !roundTeamIds.has(tt.team_id))

                      return (
                        <div key={round.id} className="rounded-md border text-sm">
                          {/* Header row */}
                          <div
                            className="group flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40"
                            onClick={() => toggleExpand(round.id)}
                          >
                            <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground">
                              {round.order}.
                            </span>
                            <span className="flex-1 font-medium">{round.name}</span>
                            {(roundTeamCounts[round.id] ?? 0) > 0 && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                {roundTeamCounts[round.id]} {t('events.entriesCount')}
                              </span>
                            )}
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-medium',
                              round.type === 'round_robin'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                            )}>
                              {t(`rounds.type.${round.type}`)}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/tournaments/${id}/events/${round.event_id}/rounds/${round.id}/groups`)
                              }}
                            >
                              {t('rounds.matches')}
                            </Button>
                            {!roundTeamCounts[round.id] && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 hover:text-destructive group-hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); handleDeleteRound(round) }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isExpanded
                              ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            }
                          </div>

                          {/* Expanded area */}
                          {isExpanded && (
                            <div className="border-t px-3 pb-3 pt-2">
                              {teams.length === 0 ? (
                                <p className="py-1 text-xs text-muted-foreground">{t('rounds.noTeams')}</p>
                              ) : (
                                <ul className="mb-2 space-y-0.5">
                                  {teams
                                    .slice()
                                    .sort((a, b) => a.team.name.localeCompare(b.team.name))
                                    .map((rt, idx) => (
                                      <li key={rt.id} className="group/item flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50">
                                        <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{idx + 1}.</span>
                                        <span className="flex-1 text-xs">{rt.team.name}</span>
                                        <button
                                          className="text-xs text-muted-foreground opacity-0 hover:text-destructive group-hover/item:opacity-100"
                                          onClick={() => handleRemoveFromRound(rt)}
                                        >
                                          {t('tournamentTeams.remove')}
                                        </button>
                                      </li>
                                    ))}
                                </ul>
                              )}

                              {eligible.length > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-1 h-6 text-xs"
                                  onClick={() => { setAddingToRoundId(round.id); setSelectedToAdd(new Set()) }}
                                >
                                  <Plus className="mr-1 h-3 w-3" />
                                  {t('rounds.addTeams')}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {isAdding && (
                      <AddRoundForm
                        order={rounds.length + 1}
                        isSaving={isSaving}
                        onSave={(name, type, allEntries) => handleAdd(event.id, name, type, allEntries)}
                        onCancel={() => setAddingEventId(null)}
                        t={t}
                      />
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </>
      )}

      {/* Add entries dialog */}
      {addingToRoundId && (() => {
        const round = Object.values(roundsByEvent).flat().find((r) => r.id === addingToRoundId)
        const event = events.find((e) => e.id === round?.event_id)
        const teams = roundTeamsData[addingToRoundId] ?? []
        const roundTeamIds = new Set(teams.map((rt) => rt.team_id))
        const eligible = (tournamentTeamsByEvent[event?.id ?? ''] ?? [])
          .filter((tt) => !roundTeamIds.has(tt.team_id))
          .sort((a, b) => a.team.name.localeCompare(b.team.name))

        return (
          <Dialog
            open
            onOpenChange={(open) => { if (!open) { setAddingToRoundId(null); setSelectedToAdd(new Set()) } }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t('rounds.addTeamsTitle', { round: round?.name ?? '' })}</DialogTitle>
              </DialogHeader>
              <div className="max-h-80 overflow-y-auto">
                {eligible.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t('rounds.noEligibleTeams')}
                  </p>
                ) : (
                  <ul className="space-y-1 py-1">
                    {eligible.map((tt) => (
                      <li key={tt.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted">
                          <input
                            type="checkbox"
                            checked={selectedToAdd.has(tt.team_id)}
                            onChange={() => setSelectedToAdd((prev) => {
                              const next = new Set(prev)
                              next.has(tt.team_id) ? next.delete(tt.team_id) : next.add(tt.team_id)
                              return next
                            })}
                            className="h-4 w-4"
                          />
                          <span className="flex-1 text-sm">{tt.team.name}</span>
                          {tt.team.players.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {tt.team.players.map((p) => `${p.last_name} ${p.first_name}`).join(' / ')}
                            </span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => { setAddingToRoundId(null); setSelectedToAdd(new Set()) }}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  disabled={selectedToAdd.size === 0 || isAddingTeams}
                  onClick={() => handleAddTeams(addingToRoundId)}
                >
                  {t('rounds.addSelected', { count: selectedToAdd.size })}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}
    </div>
  )
}
