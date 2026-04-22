import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import type {
  Player,
  Tournament,
  Event,
  TournamentTeamWithTeam,
  TeamWithPlayers,
  TournamentPlayerWithPlayer,
  EventCategory,
} from '@shared/types/ipc'

// ─── constants ────────────────────────────────────────────────────────────────

type Gender = 'M' | 'F'

const ELIGIBLE: Record<Gender, EventCategory[]> = {
  M: ['MS', 'MD', 'XD'],
  F: ['WS', 'WD', 'XD'],
}

const DOUBLES: EventCategory[] = ['MD', 'WD', 'XD']

const CATEGORY_STYLE: Record<EventCategory, string> = {
  MS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  WS: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  MD: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  WD: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  XD: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
}

/** Required partner gender given a doubles category and the player's own gender */
function partnerGender(category: EventCategory, playerGender: Gender): Gender {
  if (category === 'MD') return 'M'
  if (category === 'WD') return 'F'
  // XD — opposite
  return playerGender === 'M' ? 'F' : 'M'
}

// ─── component ────────────────────────────────────────────────────────────────

export function TournamentPlayerDetail() {
  const { id, playerId } = useParams<{ id: string; playerId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [tournament, setTournament] = useState<Tournament | undefined>()
  const [player, setPlayer] = useState<Player | undefined>()
  const [events, setEvents] = useState<Event[]>([])
  const [tournamentEntries, setTournamentEntries] = useState<TournamentTeamWithTeam[]>([])
  const [allTeams, setAllTeams] = useState<TeamWithPlayers[]>([])
  const [allRegistrations, setAllRegistrations] = useState<TournamentPlayerWithPlayer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // which event card has the register panel open
  const [openEventId, setOpenEventId] = useState<string | null>(null)
  // selected partner player id per event
  const [partnerIds, setPartnerIds] = useState<Record<string, string>>({})
  // saving state per event
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!id || !playerId) return
    Promise.all([
      api.tournament.getById(id),
      api.players.getById(playerId),
      api.events.listByTournament(id),
      api.tournamentTeams.listByTournament(id),
      api.teams.list(),
      api.tournamentPlayers.listByTournament(id),
    ]).then(([t, p, evs, entries, teams, regPlayers]) => {
      setTournament(t)
      setPlayer(p)
      setEvents(evs)
      setTournamentEntries(entries)
      setAllTeams(teams)
      setAllRegistrations(regPlayers)
      setIsLoading(false)
    })
  }, [id, playerId])

  // ── derived ────────────────────────────────────────────────────────────────

  const playerReg = useMemo(
    () => allRegistrations.find((r) => r.player_id === playerId),
    [allRegistrations, playerId]
  )

  const acceptedPlayers = useMemo(
    () => allRegistrations.filter((r) => r.status === 'accepted'),
    [allRegistrations]
  )

  const playerEntry = useMemo(
    () => tournamentEntries.filter((tt) => tt.team.players.some((pl) => pl.id === playerId)),
    [tournamentEntries, playerId]
  )

  const entryByEventId = useMemo(() => {
    const m = new Map<string, TournamentTeamWithTeam>()
    for (const tt of playerEntry) m.set(tt.event_id, tt)
    return m
  }, [playerEntry])

  // team IDs already registered in a given event (to avoid duplicates)
  const registeredTeamIdsByEvent = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const tt of tournamentEntries) {
      if (!m.has(tt.event_id)) m.set(tt.event_id, new Set())
      m.get(tt.event_id)!.add(tt.team_id)
    }
    return m
  }, [tournamentEntries])

  /** Existing teams containing this player that match the event and aren't yet entered */
  function existingTeamsFor(event: Event): TeamWithPlayers[] {
    const already = registeredTeamIdsByEvent.get(event.id) ?? new Set()
    return allTeams.filter(
      (t) =>
        t.category === event.category &&
        t.players.some((pl) => pl.id === playerId) &&
        !already.has(t.id)
    )
  }

  /** Accepted players eligible as a partner for the given event */
  function partnersFor(event: Event): TournamentPlayerWithPlayer[] {
    if (!player) return []
    const pg = partnerGender(event.category, player.gender as Gender)
    // player IDs already in a team for this event
    const usedIds = new Set<string>()
    for (const tt of tournamentEntries.filter((tt) => tt.event_id === event.id)) {
      tt.team.players.forEach((pl) => usedIds.add(pl.id))
    }
    return acceptedPlayers
      .filter((r) => r.player.gender === pg && r.player_id !== playerId && !usedIds.has(r.player_id))
      .sort(
        (a, b) =>
          a.player.last_name.localeCompare(b.player.last_name) ||
          a.player.first_name.localeCompare(b.player.first_name)
      )
  }

  // ── actions ────────────────────────────────────────────────────────────────

  function setSavingFor(eventId: string, val: boolean) {
    setSaving((prev) => ({ ...prev, [eventId]: val }))
  }

  /** If the player's registration is not yet accepted, accept it now. */
  async function acceptPlayerIfNeeded() {
    if (!playerReg || playerReg.status === 'accepted') return
    const updated = await api.tournamentPlayers.updateStatus(playerReg.id, 'accepted')
    setAllRegistrations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }

  async function handleRegisterSingles(event: Event) {
    if (!id) return
    setSavingFor(event.id, true)
    try {
      // Accept first — this triggers ensureSinglesTeamOnAccept on the main process,
      // which creates the singles team if it doesn't exist yet.
      await acceptPlayerIfNeeded()

      // Re-fetch teams so the newly created singles team is available.
      const freshTeams = await api.teams.list()
      setAllTeams(freshTeams)

      const singlesTeam = freshTeams.find(
        (t) => t.category === event.category && t.players.some((pl) => pl.id === playerId)
      )
      if (!singlesTeam) return

      const entry = await api.tournamentTeams.add(id, event.id, singlesTeam.id)
      setTournamentEntries((prev) => [...prev, entry])
    } finally {
      setSavingFor(event.id, false)
    }
  }

  async function handleRegisterExisting(event: Event, team: TeamWithPlayers) {
    if (!id) return
    setSavingFor(event.id, true)
    try {
      const entry = await api.tournamentTeams.add(id, event.id, team.id)
      setTournamentEntries((prev) => [...prev, entry])
      await acceptPlayerIfNeeded()
      setOpenEventId(null)
    } finally {
      setSavingFor(event.id, false)
    }
  }

  async function handleCreatePair(event: Event) {
    if (!id || !player) return
    const partnerId = partnerIds[event.id]
    if (!partnerId) return

    const partner = acceptedPlayers.find((r) => r.player_id === partnerId)
    if (!partner) return

    setSavingFor(event.id, true)
    try {
      // Determine player order: for XD put M first
      let p1Id = playerId!
      let p1Name = `${player.last_name}`
      let p2Id = partnerId
      let p2Name = `${partner.player.last_name}`
      if (event.category === 'XD') {
        if (player.gender === 'F') {
          ;[p1Id, p1Name, p2Id, p2Name] = [p2Id, p2Name, p1Id, p1Name]
        }
      }
      const team = await api.teams.create({
        name: `${p1Name} / ${p2Name}`,
        category: event.category,
        player_ids: [p1Id, p2Id],
      })
      setAllTeams((prev) => [...prev, team])
      const entry = await api.tournamentTeams.add(id, event.id, team.id)
      setTournamentEntries((prev) => [...prev, entry])
      await acceptPlayerIfNeeded()
      setOpenEventId(null)
      setPartnerIds((prev) => ({ ...prev, [event.id]: '' }))
    } finally {
      setSavingFor(event.id, false)
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  if (!player) {
    return <div className="p-6 text-sm text-muted-foreground">{t('tournamentDetail.notFound')}</div>
  }

  const eligible = ELIGIBLE[player.gender as Gender]
  const eligibleEvents = events.filter((e) => eligible.includes(e.category))

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/tournaments/${id}/players`)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <p className="text-xs text-muted-foreground">{tournament?.name}</p>
          <h1 className="text-xl font-semibold">
            {player.last_name} {player.first_name}
          </h1>
        </div>
      </div>

      {/* Player info */}
      <div className="mb-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {player.club && (
          <>
            <span className="text-muted-foreground">{t('players.club')}</span>
            <span>{player.club}</span>
          </>
        )}
        {player.birth_year != null && (
          <>
            <span className="text-muted-foreground">{t('players.birthYear')}</span>
            <span>{player.birth_year}</span>
          </>
        )}
        <span className="text-muted-foreground">{t('players.gender')}</span>
        <span>{player.gender === 'M' ? 'M' : 'W'}</span>
      </div>

      {/* Eligible event categories */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t('playerDetail.entries')}
      </h2>

      {eligibleEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('playerDetail.noEligibleEvents')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {eligibleEvents.map((event) => {
            const entry = entryByEventId.get(event.id)
            const enrolled = !!entry
            const isDoubles = DOUBLES.includes(event.category)
            const partner = entry?.team.players.find((pl) => pl.id !== playerId)
            const isOpen = openEventId === event.id
            const isSavingNow = !!saving[event.id]

            if (enrolled) {
              // ── enrolled card ──────────────────────────────────────────────
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 rounded-lg border bg-muted/60 px-4 py-3 text-sm"
                >
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-semibold',
                      CATEGORY_STYLE[event.category]
                    )}
                  >
                    {event.category}
                  </span>
                  <span className="font-medium">{event.name}</span>
                  {isDoubles && partner && (
                    <span className="text-muted-foreground">
                      {t('playerDetail.with')} {partner.last_name} {partner.first_name}
                    </span>
                  )}
                  <Check className="ml-auto h-4 w-4 text-green-600" />
                </div>
              )
            }

            // ── not enrolled card ──────────────────────────────────────────
            const existingTeams = existingTeamsFor(event)
            const partners = isDoubles ? partnersFor(event) : []
            const selectedPartnerId = partnerIds[event.id] ?? ''

            return (
              <div key={event.id} className="rounded-lg border text-sm">
                {/* Card row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-semibold opacity-60',
                      CATEGORY_STYLE[event.category]
                    )}
                  >
                    {event.category}
                  </span>
                  <span className="font-medium text-muted-foreground">{event.name}</span>

                  <div className="ml-auto flex items-center gap-2">
                    {!isDoubles ? (
                      // Singles — one-click register
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={isSavingNow}
                        onClick={() => handleRegisterSingles(event)}
                      >
                        {t('playerDetail.register')}
                      </Button>
                    ) : (
                      // Doubles — toggle panel
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={() => setOpenEventId(isOpen ? null : event.id)}
                      >
                        {t('playerDetail.register')}
                        {isOpen ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Doubles register panel */}
                {isDoubles && isOpen && (
                  <div className="border-t px-4 py-3 flex flex-col gap-4">

                    {/* Existing teams */}
                    {existingTeams.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t('playerDetail.existingPairs')}
                        </p>
                        {existingTeams.map((team) => {
                          const teamPartner = team.players.find((pl) => pl.id !== playerId)
                          return (
                            <div
                              key={team.id}
                              className="flex items-center gap-3 rounded-md border px-3 py-2"
                            >
                              <span className="flex-1 text-sm">
                                {teamPartner
                                  ? `${teamPartner.last_name} ${teamPartner.first_name}`
                                  : team.name}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={isSavingNow}
                                onClick={() => handleRegisterExisting(event, team)}
                              >
                                {t('playerDetail.register')}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Create new pair */}
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t('playerDetail.newPair')}
                      </p>
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedPartnerId}
                          onChange={(e) =>
                            setPartnerIds((prev) => ({ ...prev, [event.id]: e.target.value }))
                          }
                          className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">{t('playerDetail.selectPartner')}</option>
                          {partners.map((r) => (
                            <option key={r.player_id} value={r.player_id}>
                              {r.player.last_name} {r.player.first_name}
                              {r.player.club ? ` — ${r.player.club}` : ''}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={!selectedPartnerId || isSavingNow}
                          onClick={() => handleCreatePair(event)}
                        >
                          {t('playerDetail.createAndRegister')}
                        </Button>
                      </div>
                      {partners.length === 0 && (
                        <p className="text-xs text-muted-foreground">{t('playerDetail.noPartners')}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
