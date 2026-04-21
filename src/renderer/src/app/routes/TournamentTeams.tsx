import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ShieldPlus, Users } from 'lucide-react'
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
  TournamentTeamWithTeam,
  TeamWithPlayers,
  TournamentPlayerWithPlayer,
  Event
} from '@shared/types/ipc'

type PlayerGender = 'M' | 'F'

/** Gender requirement for each doubles category */
const DOUBLES_GENDERS: Record<string, [PlayerGender, PlayerGender] | null> = {
  MD: ['M', 'M'],
  WD: ['F', 'F'],
  XD: ['M', 'F']
}

export function TournamentTeams() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()

  const [tournament, setTournament] = useState<Tournament | undefined>()
  const [tournamentEvents, setTournamentEvents] = useState<Event[]>([])
  const [entries, setEntries] = useState<TournamentTeamWithTeam[]>([])
  const [allTeams, setAllTeams] = useState<TeamWithPlayers[]>([])
  const [acceptedPlayers, setAcceptedPlayers] = useState<TournamentPlayerWithPlayer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [activeEventId, setActiveEventId] = useState<string | null>(null)

  // Bulk-add dialog (existing teams)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)

  // New pair dialog (doubles only)
  const [pairDialogOpen, setPairDialogOpen] = useState(false)
  const [pairPlayer1Id, setPairPlayer1Id] = useState('')
  const [pairPlayer2Id, setPairPlayer2Id] = useState('')
  const [isCreatingPair, setIsCreatingPair] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.tournament.getById(id),
      api.events.listByTournament(id),
      api.tournamentTeams.listByTournament(id),
      api.teams.list(),
      api.tournamentPlayers.listByTournament(id)
    ]).then(([tournament, events, entries, teams, players]) => {
      setTournament(tournament)
      setTournamentEvents(events)
      setEntries(entries)
      setAllTeams(teams)
      setAcceptedPlayers(players.filter((p) => p.status === 'accepted'))
      const requestedEvent = searchParams.get('event')
      const initialEvent = requestedEvent && events.some((e) => e.id === requestedEvent)
        ? requestedEvent
        : events[0]?.id ?? null
      setActiveEventId(initialEvent)
      setIsLoading(false)
    })
  }, [id])

  const activeEvent = tournamentEvents.find((e) => e.id === activeEventId)
  const doublesGenders = activeEvent ? DOUBLES_GENDERS[activeEvent.category] ?? null : null

  // IDs of teams already registered for the active event
  const registeredInActiveEvent = useMemo(
    () => new Set(entries.filter((e) => e.event_id === activeEventId).map((e) => e.team_id)),
    [entries, activeEventId]
  )

  const acceptedPlayerIds = useMemo(
    () => new Set(acceptedPlayers.map((p) => p.player_id)),
    [acceptedPlayers]
  )

  // Teams eligible for the active event:
  // - matching category
  // - not yet registered in this event
  // - for singles (MS/WS): the player must be accepted in the tournament
  const eligibleTeams = useMemo(() => {
    if (!activeEvent) return []
    return allTeams.filter((t) => {
      if (t.category !== activeEvent.category) return false
      if (registeredInActiveEvent.has(t.id)) return false
      // all players in the team must be accepted in the tournament
      if (t.players.some((p) => !acceptedPlayerIds.has(p.id))) return false
      return true
    })
  }, [allTeams, activeEvent, registeredInActiveEvent, acceptedPlayerIds])

  const filteredTeams = useMemo(() => {
    const q = search.toLowerCase()
    const result = q
      ? eligibleTeams.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.players.some(
              (p) =>
                p.last_name.toLowerCase().includes(q) || p.first_name.toLowerCase().includes(q)
            )
        )
      : [...eligibleTeams]
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [eligibleTeams, search])

  const allFilteredSelected =
    filteredTeams.length > 0 && filteredTeams.every((t) => selected.has(t.id))

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) filteredTeams.forEach((t) => next.delete(t.id))
      else filteredTeams.forEach((t) => next.add(t.id))
      return next
    })
  }

  function toggle(teamId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(teamId) ? next.delete(teamId) : next.add(teamId)
      return next
    })
  }

  function openDialog() {
    setSearch('')
    setSelected(new Set())
    setDialogOpen(true)
  }

  function openPairDialog() {
    setPairPlayer1Id('')
    setPairPlayer2Id('')
    setPairDialogOpen(true)
  }

  async function handleAdd() {
    if (!id || !activeEventId || selected.size === 0) return
    setIsSaving(true)
    try {
      const added = await api.tournamentTeams.addMany(id, activeEventId, [...selected])
      setEntries((prev) => [...prev, ...added])
      setDialogOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove(entryId: string) {
    await api.tournamentTeams.remove(entryId)
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
  }

  async function handleCreatePair() {
    if (!id || !activeEventId || !activeEvent || !pairPlayer1Id || !pairPlayer2Id) return
    if (pairPlayer1Id === pairPlayer2Id) return
    setIsCreatingPair(true)
    try {
      const p1 = acceptedPlayers.find((p) => p.player_id === pairPlayer1Id)!
      const p2 = acceptedPlayers.find((p) => p.player_id === pairPlayer2Id)!
      const name = `${p1.player.last_name} / ${p2.player.last_name}`
      const team = await api.teams.create({
        name,
        category: activeEvent.category,
        player_ids: [pairPlayer1Id, pairPlayer2Id]
      })
      setAllTeams((prev) => [...prev, team])
      const entry = await api.tournamentTeams.add(id, activeEventId, team.id)
      setEntries((prev) => [...prev, entry])
      setPairDialogOpen(false)
    } finally {
      setIsCreatingPair(false)
    }
  }

  function playerNames(team: TeamWithPlayers) {
    return team.players.map((p) => `${p.last_name} ${p.first_name}`).join(' / ')
  }

  // Players available for a pair slot:
  // - accepted in this tournament
  // - matching required gender
  // - not already in a team registered for the active event
  // - not the player selected in the other slot
  function playersForSlot(genderRequired: PlayerGender, excludeId: string) {
    return acceptedPlayers
      .filter(
        (p) =>
          p.player.gender === genderRequired &&
          p.player_id !== excludeId &&
          !alreadyPairedIds.has(p.player_id)
      )
      .sort((a, b) =>
        a.player.last_name.localeCompare(b.player.last_name) ||
        a.player.first_name.localeCompare(b.player.first_name)
      )
  }

  const activeEntries = entries
    .filter((e) => e.event_id === activeEventId)
    .sort((a, b) => a.team.name.localeCompare(b.team.name))

  // Player IDs already assigned to a team in the active event
  const alreadyPairedIds = useMemo(() => {
    const ids = new Set<string>()
    activeEntries.forEach((entry) => entry.team.players.forEach((p) => ids.add(p.id)))
    return ids
  }, [activeEntries])

  const tabsScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    updateScrollButtons()
    const el = tabsScrollRef.current
    if (!el) return
    const ro = new ResizeObserver(updateScrollButtons)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tournamentEvents])

  useEffect(() => {
    const el = tabsScrollRef.current
    if (!el || !activeEventId) return
    const activeBtn = el.querySelector<HTMLElement>('[data-event-id="' + activeEventId + '"]')
    activeBtn?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [activeEventId])

  function updateScrollButtons() {
    const el = tabsScrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }

  function scrollTabs(dir: 'left' | 'right') {
    const el = tabsScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' })
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/tournaments/${id}`)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <p className="text-xs text-muted-foreground">{tournament?.name}</p>
          <h1 className="text-xl font-semibold">{t('tournamentTeams.title')}</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {activeEntries.length > 0 && (
            <span className="text-sm text-muted-foreground">{t('tournamentTeams.entriesCount', { count: activeEntries.length })}</span>
          )}
          {activeEvent && doublesGenders && (
            <Button variant="outline" onClick={openPairDialog}>
              <Users className="mr-1.5 h-4 w-4" />
              {t('tournamentTeams.newPair')}
            </Button>
          )}
          {activeEvent && eligibleTeams.length > 0 && (
            <Button onClick={openDialog}>
              <ShieldPlus className="mr-1.5 h-4 w-4" />
              {t('tournamentTeams.add')}
            </Button>
          )}
        </div>
      </div>

      {/* No events guard */}
      {tournamentEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
          <p className="font-medium">{t('tournamentTeams.noEvents')}</p>
          <p className="text-sm text-muted-foreground">{t('tournamentTeams.noEventsHint')}</p>
        </div>
      ) : (
        <>
          {/* Event tabs */}
          <div className="relative mb-6 flex items-end border-b">
            {canScrollLeft && (
              <button
                onClick={() => scrollTabs('left')}
                className="absolute left-0 z-10 flex h-full items-center bg-gradient-to-r from-background via-background/90 to-transparent pr-4 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <div
              ref={tabsScrollRef}
              onScroll={updateScrollButtons}
              className="flex gap-1 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ maskImage: canScrollRight ? 'linear-gradient(to right, black 85%, transparent 100%)' : undefined }}
            >
              {tournamentEvents.map((event) => {
                const count = entries.filter((e) => e.event_id === event.id).length
                return (
                  <button
                    key={event.id}
                    data-event-id={event.id}
                    onClick={() => setActiveEventId(event.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-t-md px-4 py-2 text-sm transition-colors',
                      event.id === activeEventId
                        ? 'bg-muted font-semibold text-foreground'
                        : 'font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    )}
                  >
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
            {canScrollRight && (
              <button
                onClick={() => scrollTabs('right')}
                className="absolute right-0 z-10 flex h-full items-center bg-gradient-to-l from-background via-background/90 to-transparent pl-4 text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Teams for active event */}
          {activeEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <p className="font-medium">{t('tournamentTeams.empty.title')}</p>
              <p className="text-sm text-muted-foreground">{t('tournamentTeams.empty.description')}</p>
              <div className="flex gap-2">
                {doublesGenders && (
                  <Button variant="outline" onClick={openPairDialog}>
                    <Users className="mr-1.5 h-4 w-4" />
                    {t('tournamentTeams.newPair')}
                  </Button>
                )}
                {eligibleTeams.length > 0 && (
                  <Button onClick={openDialog}>
                    <ShieldPlus className="mr-1.5 h-4 w-4" />
                    {t('tournamentTeams.add')}
                  </Button>
                )}
              </div>
              {eligibleTeams.length === 0 && !doublesGenders && (
                <p className="text-xs text-muted-foreground">{t('tournamentTeams.noEligibleTeams')}</p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">{t('tournamentForm.name')}</th>
                  <th className="pb-2 pr-4 font-medium">{t('tournamentTeams.players')}</th>
                  <th className="pb-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {activeEntries.map((entry) => (
                  <tr key={entry.id} className="group border-b">
                    <td className="py-2 pr-4 font-medium">{entry.team.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{playerNames(entry.team)}</td>
                    <td className="py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                        onClick={() => handleRemove(entry.id)}
                      >
                        {t('tournamentTeams.remove')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Bulk-add dialog (existing teams) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t('tournamentTeams.addDialogTitle')}
              {activeEvent && (
                <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs font-medium',
                  statusClass[activeEvent.category] ?? 'bg-muted text-muted-foreground')}>
                  {activeEvent.category} — {activeEvent.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tournamentTeams.search')}
            autoFocus
          />

          {filteredTeams.length > 0 && (
            <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm font-medium">{t('tournamentTeams.selectAll')}</span>
              <span className="ml-auto text-xs text-muted-foreground">{t('tournamentTeams.entriesCount', { count: filteredTeams.length })}</span>
            </label>
          )}

          <div className="max-h-72 overflow-y-auto rounded-md border">
            {filteredTeams.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">{t('tournamentTeams.noEntriesFound')}</p>
            ) : (
              <ul>
                {filteredTeams.map((team) => (
                  <li key={team.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={selected.has(team.id)}
                        onChange={() => toggle(team.id)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <span className="flex-1 text-sm font-medium">{team.name}</span>
                      <span className="text-xs text-muted-foreground">{playerNames(team)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={selected.size === 0 || isSaving} onClick={handleAdd}>
              {t('tournamentTeams.addSelected', { count: selected.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New pair dialog (doubles) */}
      <Dialog open={pairDialogOpen} onOpenChange={setPairDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t('tournamentTeams.newPairTitle')}
              {activeEvent && (
                <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs font-medium',
                  statusClass[activeEvent.category] ?? 'bg-muted text-muted-foreground')}>
                  {activeEvent.category} — {activeEvent.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {doublesGenders && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t('tournamentTeams.player1')}
                  <span className="ml-1 rounded bg-muted px-1 py-0.5 text-xs">{doublesGenders[0]}</span>
                </label>
                <select
                  value={pairPlayer1Id}
                  onChange={(e) => setPairPlayer1Id(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{t('tournamentTeams.selectPlayer')}</option>
                  {playersForSlot(doublesGenders[0], pairPlayer2Id).map((tp) => (
                    <option key={tp.player_id} value={tp.player_id}>
                      {tp.player.last_name} {tp.player.first_name}{tp.player.club ? ` — ${tp.player.club}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t('tournamentTeams.player2')}
                  <span className="ml-1 rounded bg-muted px-1 py-0.5 text-xs">{doublesGenders[1]}</span>
                </label>
                <select
                  value={pairPlayer2Id}
                  onChange={(e) => setPairPlayer2Id(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{t('tournamentTeams.selectPlayer')}</option>
                  {playersForSlot(doublesGenders[1], pairPlayer1Id).map((tp) => (
                    <option key={tp.player_id} value={tp.player_id}>
                      {tp.player.last_name} {tp.player.first_name}{tp.player.club ? ` — ${tp.player.club}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPairDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!pairPlayer1Id || !pairPlayer2Id || pairPlayer1Id === pairPlayer2Id || isCreatingPair}
              onClick={handleCreatePair}
            >
              {t('tournamentTeams.createPair')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
