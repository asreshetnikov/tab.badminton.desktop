import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, ChevronDown, ChevronRight, Users, Swords, RefreshCw } from 'lucide-react'
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
  TournamentTeamWithTeam,
  RoundTeamWithTeam,
  MatchWithTeams
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
  onSave: (name: string, type: RoundType) => void
  onCancel: () => void
  t: (key: string) => string
}) {
  const [name, setName] = useState('Main Draw')
  const [type, setType] = useState<RoundType>('playoff')

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3">
      <span className="w-5 text-right text-xs text-muted-foreground">{order}.</span>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSave(name.trim(), type)
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={t('rounds.namePlaceholder')}
        autoFocus
        className="h-7 flex-1 text-sm"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as RoundType)}
        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
      >
        {ROUND_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        className="h-7 text-xs"
        disabled={!name.trim() || isSaving}
        onClick={() => name.trim() && onSave(name.trim(), type)}
      >
        {t('rounds.add')}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  )
}

export function TournamentRounds() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [tournament, setTournament] = useState<Tournament | undefined>()
  const [events, setEvents] = useState<Event[]>([])
  const [roundsByEvent, setRoundsByEvent] = useState<Record<string, Round[]>>({})
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeamWithTeam[]>([])
  const [roundTeamsByRound, setRoundTeamsByRound] = useState<Record<string, RoundTeamWithTeam[]>>({})
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null)
  const [addTeamsRoundId, setAddTeamsRoundId] = useState<string | null>(null)
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())
  const [isAddingTeams, setIsAddingTeams] = useState(false)
  const [matchesByRound, setMatchesByRound] = useState<Record<string, MatchWithTeams[]>>({})
  const [generatingRoundId, setGeneratingRoundId] = useState<string | null>(null)
  const [regenConfirmRoundId, setRegenConfirmRoundId] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.tournament.getById(id),
      api.events.listByTournament(id),
      api.tournamentTeams.listByTournament(id)
    ]).then(async ([tournament, events, ttList]) => {
      setTournament(tournament)
      setEvents(events)
      setTournamentTeams(ttList)
      setActiveEventId(events[0]?.id ?? null)
      const entries = await Promise.all(
        events.map((e) => api.rounds.listByEvent(e.id).then((rounds) => [e.id, rounds] as const))
      )
      setRoundsByEvent(Object.fromEntries(entries))
      setIsLoading(false)
    })
  }, [id])

  const activeRounds = activeEventId ? (roundsByEvent[activeEventId] ?? []) : []

  function switchTab(eventId: string) {
    setActiveEventId(eventId)
    setAdding(false)
    setExpandedRoundId(null)
  }

  async function handleAdd(name: string, type: RoundType) {
    if (!activeEventId) return
    setIsSaving(true)
    try {
      const round = await api.rounds.create({ event_id: activeEventId, name, type })
      setRoundsByEvent((prev) => ({
        ...prev,
        [activeEventId]: [...(prev[activeEventId] ?? []), round]
      }))
      setAdding(false)
    } finally {
      setIsSaving(false)
    }
  }

  function startEditing(round: Round) {
    setEditingId(round.id)
    setEditName(round.name)
  }

  async function submitEdit(round: Round) {
    const name = editName.trim()
    if (!name || name === round.name) { setEditingId(null); return }
    const updated = await api.rounds.update(round.id, { name })
    setRoundsByEvent((prev) => ({
      ...prev,
      [round.event_id]: (prev[round.event_id] ?? []).map((r) => (r.id === round.id ? updated : r))
    }))
    setEditingId(null)
  }

  async function handleDeleteRound(round: Round) {
    await api.rounds.delete(round.id)
    setRoundsByEvent((prev) => ({
      ...prev,
      [round.event_id]: (prev[round.event_id] ?? []).filter((r) => r.id !== round.id)
    }))
    if (expandedRoundId === round.id) setExpandedRoundId(null)
  }

  async function toggleExpand(round: Round) {
    if (expandedRoundId === round.id) {
      setExpandedRoundId(null)
      return
    }
    setExpandedRoundId(round.id)
    const [teams, matchList] = await Promise.all([
      roundTeamsByRound[round.id] ? Promise.resolve(roundTeamsByRound[round.id]) : api.roundTeams.listByRound(round.id),
      matchesByRound[round.id] !== undefined ? Promise.resolve(matchesByRound[round.id]) : api.matches.listByRound(round.id)
    ])
    setRoundTeamsByRound((prev) => ({ ...prev, [round.id]: teams }))
    setMatchesByRound((prev) => ({ ...prev, [round.id]: matchList }))
  }

  async function handleGenerateMatches(roundId: string) {
    setGeneratingRoundId(roundId)
    try {
      const generated = await api.matches.generate(roundId)
      setMatchesByRound((prev) => ({ ...prev, [roundId]: generated }))
    } finally {
      setGeneratingRoundId(null)
    }
  }

  async function handleRegenMatches(roundId: string) {
    setRegenConfirmRoundId(null)
    setGeneratingRoundId(roundId)
    try {
      await api.matches.deleteByRound(roundId)
      const generated = await api.matches.generate(roundId)
      setMatchesByRound((prev) => ({ ...prev, [roundId]: generated }))
    } finally {
      setGeneratingRoundId(null)
    }
  }

  // Teams in the active event that are eligible to add to a round
  const eventTeams = useMemo(
    () => tournamentTeams.filter((tt) => tt.event_id === activeEventId),
    [tournamentTeams, activeEventId]
  )

  function openAddTeamsDialog(roundId: string) {
    setAddTeamsRoundId(roundId)
    setSelectedTeamIds(new Set())
  }

  function closeAddTeamsDialog() {
    setAddTeamsRoundId(null)
    setSelectedTeamIds(new Set())
  }

  const addTeamsRound = addTeamsRoundId
    ? activeRounds.find((r) => r.id === addTeamsRoundId)
    : null

  const alreadyInRound = useMemo(() => {
    if (!addTeamsRoundId) return new Set<string>()
    return new Set((roundTeamsByRound[addTeamsRoundId] ?? []).map((rt) => rt.team_id))
  }, [addTeamsRoundId, roundTeamsByRound])

  const eligibleToAdd = useMemo(
    () =>
      eventTeams
        .filter((tt) => !alreadyInRound.has(tt.team_id))
        .sort((a, b) => a.team.name.localeCompare(b.team.name)),
    [eventTeams, alreadyInRound]
  )

  function toggleTeam(teamId: string) {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  async function handleAddTeams() {
    if (!addTeamsRoundId || selectedTeamIds.size === 0) return
    setIsAddingTeams(true)
    try {
      const added = await api.roundTeams.addMany(addTeamsRoundId, [...selectedTeamIds])
      setRoundTeamsByRound((prev) => ({
        ...prev,
        [addTeamsRoundId]: [...(prev[addTeamsRoundId] ?? []), ...added]
      }))
      closeAddTeamsDialog()
    } finally {
      setIsAddingTeams(false)
    }
  }

  async function handleRemoveRoundTeam(rt: RoundTeamWithTeam) {
    await api.roundTeams.remove(rt.id)
    setRoundTeamsByRound((prev) => ({
      ...prev,
      [rt.round_id]: (prev[rt.round_id] ?? []).filter((r) => r.id !== rt.id)
    }))
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
        {activeEventId && !adding && (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('rounds.add')}
          </Button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
          <p className="font-medium">{t('rounds.noEvents')}</p>
          <p className="text-sm text-muted-foreground">{t('rounds.noEventsHint')}</p>
        </div>
      ) : (
        <>
          {/* Event tabs */}
          <div className="mb-6 flex gap-1 border-b">
            {events.map((event) => {
              const count = roundsByEvent[event.id]?.length ?? 0
              return (
                <button
                  key={event.id}
                  onClick={() => switchTab(event.id)}
                  className={cn(
                    'flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                    event.id === activeEventId
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold',
                    statusClass[event.category] ?? 'bg-muted text-muted-foreground')}>
                    {event.category}
                  </span>
                  {event.name}
                  {count > 0 && (
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {activeRounds.length === 0 && !adding ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <p className="font-medium">{t('rounds.empty.title')}</p>
              <p className="text-sm text-muted-foreground">{t('rounds.empty.description')}</p>
              <Button onClick={() => setAdding(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('rounds.add')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeRounds.map((round) => {
                const isExpanded = expandedRoundId === round.id
                const roundTeams = roundTeamsByRound[round.id] ?? []
                const teamCount = isExpanded ? roundTeams.length : (roundTeamsByRound[round.id]?.length ?? null)

                return (
                  <div key={round.id} className="rounded-lg border">
                    {/* Round row */}
                    <div className="group flex items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => toggleExpand(round)}
                        className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>

                      <span className="w-5 text-right text-xs text-muted-foreground">{round.order}.</span>

                      {editingId === round.id ? (
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitEdit(round)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          onBlur={() => submitEdit(round)}
                          autoFocus
                          className="h-7 flex-1 text-sm font-medium"
                        />
                      ) : (
                        <span
                          className="flex-1 cursor-pointer font-medium hover:text-primary"
                          onClick={() => startEditing(round)}
                        >
                          {round.name}
                        </span>
                      )}

                      {teamCount !== null && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {teamCount}
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
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 hover:text-destructive group-hover:opacity-100"
                        onClick={() => handleDeleteRound(round)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Expanded: team list + matches */}
                    {isExpanded && (
                      <div className="border-t px-4 py-3 space-y-4">
                        {/* Teams section */}
                        <div>
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t('rounds.participants')}
                          </p>
                          {roundTeams.length === 0 ? (
                            <p className="py-1 text-sm text-muted-foreground">
                              {t('rounds.noTeams')}
                            </p>
                          ) : (
                            <ul className="mb-2 space-y-0.5">
                              {roundTeams
                                .slice()
                                .sort((a, b) => a.team.name.localeCompare(b.team.name))
                                .map((rt, idx) => (
                                  <li key={rt.id} className="group/rt flex items-center gap-2 text-sm">
                                    <span className="w-5 text-right text-xs text-muted-foreground">{idx + 1}.</span>
                                    <span className="flex-1">{rt.team.name}</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 opacity-0 hover:text-destructive group-hover/rt:opacity-100"
                                      onClick={() => handleRemoveRoundTeam(rt)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </li>
                                ))}
                            </ul>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => openAddTeamsDialog(round.id)}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            {t('rounds.addTeams')}
                          </Button>
                        </div>

                        {/* Matches section (only for round_robin) */}
                        {round.type === 'round_robin' && (
                          <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {t('rounds.matches')}
                            </p>
                            {(() => {
                              const roundMatches = matchesByRound[round.id] ?? []
                              const isGenerating = generatingRoundId === round.id
                              if (roundMatches.length === 0) {
                                return (
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm text-muted-foreground">{t('rounds.noMatches')}</p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      disabled={roundTeams.length < 2 || isGenerating}
                                      onClick={() => handleGenerateMatches(round.id)}
                                    >
                                      <Swords className="mr-1 h-3 w-3" />
                                      {t('rounds.generate')}
                                    </Button>
                                  </div>
                                )
                              }
                              // Group matches by tour
                              const byTour = roundMatches.reduce<Record<number, typeof roundMatches>>(
                                (acc, m) => {
                                  const tour = m.tour ?? 1
                                  acc[tour] = acc[tour] ?? []
                                  acc[tour].push(m)
                                  return acc
                                },
                                {}
                              )
                              return (
                                <div>
                                  <div className="mb-2 space-y-3">
                                    {Object.entries(byTour).map(([tour, tourMatches]) => (
                                      <div key={tour}>
                                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                                          {t('rounds.tour', { n: tour })}
                                        </p>
                                        <ul className="space-y-0.5">
                                          {tourMatches.map((m) => (
                                            <li key={m.id} className="flex items-center gap-2 text-sm pl-2">
                                              <span className="flex-1">
                                                {m.team1?.name ?? '—'}{' '}
                                                <span className="text-muted-foreground">vs</span>{' '}
                                                {m.team2?.name ?? '—'}
                                              </span>
                                              <span className="text-xs text-muted-foreground">
                                                {t(`matches.status.${m.status}`)}
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ))}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-muted-foreground"
                                    disabled={isGenerating}
                                    onClick={() => setRegenConfirmRoundId(round.id)}
                                  >
                                    <RefreshCw className="mr-1 h-3 w-3" />
                                    {t('rounds.regenerate')}
                                  </Button>
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {adding && (
                <AddRoundForm
                  order={activeRounds.length + 1}
                  isSaving={isSaving}
                  onSave={handleAdd}
                  onCancel={() => setAdding(false)}
                  t={t}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* Regenerate confirmation dialog */}
      <Dialog open={!!regenConfirmRoundId} onOpenChange={(open) => { if (!open) setRegenConfirmRoundId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('rounds.regenerateTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('rounds.regenerateDescription')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenConfirmRoundId(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => regenConfirmRoundId && handleRegenMatches(regenConfirmRoundId)}>
              {t('rounds.regenerate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Teams dialog */}
      <Dialog open={!!addTeamsRoundId} onOpenChange={(open) => { if (!open) closeAddTeamsDialog() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('rounds.addTeamsTitle', { round: addTeamsRound?.name ?? '' })}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {eligibleToAdd.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t('rounds.noEligibleTeams')}
              </p>
            ) : (
              <ul className="space-y-1 py-1">
                {eligibleToAdd.map((tt) => (
                  <li key={tt.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.has(tt.team_id)}
                        onChange={() => toggleTeam(tt.team_id)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1 text-sm">{tt.team.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAddTeamsDialog}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={selectedTeamIds.size === 0 || isAddingTeams}
              onClick={handleAddTeams}
            >
              {t('rounds.addSelected', { count: selectedTeamIds.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
