import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
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
import type { Court, MatchSlot, ConflictInfo, Tournament, MatchWithTeams, UpdateMatchResultDTO } from '@shared/types/ipc'
import type { MatchStatus } from '@shared/types/match'

// ─── Constants ────────────────────────────────────────────────────────────────

const MATCH_DURATION = 60 // minutes — used for conflict checking

const CATEGORY_COLORS: Record<string, string> = {
  MS: 'bg-blue-50 border-blue-200 text-blue-900',
  WS: 'bg-pink-50 border-pink-200 text-pink-900',
  MD: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  WD: 'bg-purple-50 border-purple-200 text-purple-900',
  XD: 'bg-teal-50 border-teal-200 text-teal-900'
}

const CATEGORY_BADGE: Record<string, string> = {
  MS: 'bg-blue-100 text-blue-700',
  WS: 'bg-pink-100 text-pink-700',
  MD: 'bg-indigo-100 text-indigo-700',
  WD: 'bg-purple-100 text-purple-700',
  XD: 'bg-teal-100 text-teal-700'
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Sort unscheduled matches: by roundOrder, then by tour (round_robin) or bracketRound (playoff).
 */
function sortUnscheduled(matches: MatchSlot[]): MatchSlot[] {
  return [...matches].sort((a, b) => {
    if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder
    const aKey = a.roundType === 'round_robin' ? (a.tour ?? 9999) : (a.bracketRound ?? 9999)
    const bKey = b.roundType === 'round_robin' ? (b.tour ?? 9999) : (b.bracketRound ?? 9999)
    return aKey - bKey
  })
}

/** Group sorted unscheduled matches into sections by round + tour/bracketRound. */
interface MatchGroup {
  roundId: string
  roundName: string
  roundType: string
  subKey: number   // tour for round_robin, bracketRound for playoff
  sortKey: number
  matches: MatchSlot[]
}

function groupUnscheduled(matches: MatchSlot[]): MatchGroup[] {
  const groups = new Map<string, MatchGroup>()
  for (const m of matches) {
    const subKey = m.roundType === 'round_robin' ? (m.tour ?? 0) : (m.bracketRound ?? 0)
    const groupId = `${m.roundId}::${subKey}`
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        roundId: m.roundId,
        roundName: m.roundName,
        roundType: m.roundType,
        subKey,
        sortKey: m.roundOrder * 10000 + subKey,
        matches: []
      })
    }
    groups.get(groupId)!.matches.push(m)
  }
  return [...groups.values()].sort((a, b) => a.sortKey - b.sortKey)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Returns the datetime string (YYYY-MM-DDTHH:MM) for the next free slot on a court,
 * or null if the court still has unfinished matches.
 * "Free" = all currently scheduled matches have a result (finished/walkover/retired).
 */
function getNextSlot(courtMatches: MatchSlot[], defaultDate: string): string | null {
  const DONE = new Set(['finished', 'walkover', 'retired'])
  const pending = courtMatches.filter((m) => !DONE.has(m.status))
  if (pending.length > 0) return null // court still busy

  // Find the latest scheduledAt among all matches on this court
  const latest = courtMatches
    .filter((m) => m.scheduledAt)
    .sort((a, b) => (b.scheduledAt ?? '').localeCompare(a.scheduledAt ?? ''))[0]?.scheduledAt

  const base = latest
    ? new Date(new Date(latest).getTime() + MATCH_DURATION * 60 * 1000)
    : new Date(`${defaultDate}T09:00:00`)

  // Format as YYYY-MM-DDTHH:MM (required by datetime-local input)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TournamentSchedule() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [tournament, setTournament] = useState<Tournament | undefined>()
  const [courts, setCourts] = useState<Court[]>([])
  const [scheduled, setScheduled] = useState<MatchSlot[]>([])
  const [unscheduled, setUnscheduled] = useState<MatchSlot[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [date, setDate] = useState(todayIso)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [roundFilter, setRoundFilter] = useState('all')

  // Assign dialog
  const [assignMatch, setAssignMatch] = useState<MatchSlot | null>(null)
  const [assignCourtId, setAssignCourtId] = useState('')
  const [assignDatetime, setAssignDatetime] = useState('')
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Drag state — id of the match currently being dragged from the left column
  const [draggingMatchId, setDraggingMatchId] = useState<string | null>(null)

  // Result dialog
  const [resultMatch, setResultMatch] = useState<MatchWithTeams | null>(null)
  const [resultSets, setResultSets] = useState<{ s1: string; s2: string }[]>([])
  const [resultStatus, setResultStatus] = useState<MatchStatus>('finished')
  const [resultWinnerId, setResultWinnerId] = useState<string>('')
  const [isSavingResult, setIsSavingResult] = useState(false)

  // ─── Load ──────────────────────────────────────────────────────────────────

  async function loadData() {
    if (!id) return
    const [t_, c, s, u] = await Promise.all([
      api.tournament.getById(id),
      api.courts.listByTournament(id),
      api.schedule.listScheduled(id),
      api.schedule.listUnscheduled(id)
    ])
    setTournament(t_)
    setCourts(c)
    setScheduled(s)
    setUnscheduled(u)
    setIsLoading(false)
  }

  useEffect(() => {
    setIsLoading(true)
    loadData()
  }, [id])

  // ─── Filter options ────────────────────────────────────────────────────────

  const allMatches = useMemo(() => [...scheduled, ...unscheduled], [scheduled, unscheduled])

  const categories = useMemo(
    () => [...new Set(allMatches.map((m) => m.eventCategory))],
    [allMatches]
  )
  const roundOptions = useMemo(() => {
    const map = new Map(allMatches.map((m) => [m.roundId, m.roundName]))
    return [...map.entries()]
  }, [allMatches])

  function matchFilter(m: MatchSlot): boolean {
    if (categoryFilter !== 'all' && m.eventCategory !== categoryFilter) return false
    if (roundFilter !== 'all' && m.roundId !== roundFilter) return false
    return true
  }

  // Unscheduled: sorted + grouped, no date filter (they have no date)
  const filteredUnscheduled = useMemo(
    () => sortUnscheduled(unscheduled.filter(matchFilter)),
    [unscheduled, categoryFilter, roundFilter]
  )
  const unscheduledGroups = useMemo(
    () => groupUnscheduled(filteredUnscheduled),
    [filteredUnscheduled]
  )

  // Unique sorted dates from all scheduled matches
  const scheduledDates = useMemo(() => {
    const dates = new Set(
      scheduled.map((m) => m.scheduledAt?.slice(0, 10)).filter(Boolean) as string[]
    )
    return [...dates].sort()
  }, [scheduled])

  // Auto-select first available date when data loads (if current date has no matches)
  useEffect(() => {
    if (scheduledDates.length > 0 && !scheduledDates.includes(date)) {
      setDate(scheduledDates[0])
    }
  }, [scheduledDates])

  // Scheduled: filtered by selected date + other filters, grouped by court
  const filteredScheduled = useMemo(
    () =>
      scheduled
        .filter((m) => m.scheduledAt?.startsWith(date) && matchFilter(m))
        .sort((a, b) => (b.scheduledAt ?? '').localeCompare(a.scheduledAt ?? '')),
    [scheduled, date, categoryFilter, roundFilter]
  )

  const scheduledByCourt = useMemo(() => {
    const map = new Map<string, { court: Court | null; matches: MatchSlot[] }>()
    // Add court groups in courts order
    for (const court of courts) {
      map.set(court.id, { court, matches: [] })
    }
    // Group matches
    for (const m of filteredScheduled) {
      const key = m.courtId ?? '__none__'
      if (!map.has(key)) {
        map.set(key, { court: null, matches: [] })
      }
      map.get(key)!.matches.push(m)
    }
    // Keep all named courts; keep anonymous groups only if they have matches
    return [...map.values()].filter((g) => g.court !== null || g.matches.length > 0)
  }, [filteredScheduled, courts])

  // ─── Drag & drop ───────────────────────────────────────────────────────────

  async function handleDropOnCourt(matchId: string, courtId: string, datetime: string) {
    setDraggingMatchId(null)
    await api.schedule.assignSlot(matchId, { courtId, datetime })
    await loadData()
  }

  // ─── Assign dialog ─────────────────────────────────────────────────────────

  function openAssign(match: MatchSlot) {
    setAssignMatch(match)
    setAssignCourtId(match.courtId ?? '')
    setAssignDatetime(match.scheduledAt ?? `${date}T10:00`)
    setConflicts([])
  }

  function closeAssign() {
    setAssignMatch(null)
    setConflicts([])
  }

  async function handleSave() {
    if (!assignMatch || !id) return
    setIsSaving(true)
    try {
      // Check conflicts for both teams
      const allConflicts: ConflictInfo[] = []
      for (const teamId of [assignMatch.team1Id, assignMatch.team2Id]) {
        if (!teamId || !assignDatetime) continue
        const c = await api.schedule.validateConflicts(assignMatch.id, {
          teamId,
          datetime: assignDatetime,
          duration: MATCH_DURATION
        })
        allConflicts.push(...c)
      }
      const unique = allConflicts.filter(
        (c, i, arr) => arr.findIndex((x) => x.matchId === c.matchId) === i
      )
      if (unique.length > 0) {
        setConflicts(unique)
        setIsSaving(false)
        return
      }
      await doSave()
    } catch {
      setIsSaving(false)
    }
  }

  async function handleSaveForce() {
    setIsSaving(true)
    try {
      await doSave()
    } catch {
      setIsSaving(false)
    }
  }

  async function doSave() {
    if (!assignMatch || !id) return
    await api.schedule.assignSlot(assignMatch.id, {
      courtId: assignCourtId || null,
      datetime: assignDatetime || null
    })
    closeAssign()
    await loadData()
    setIsSaving(false)
  }

  async function handleUnassign() {
    if (!assignMatch || !id) return
    setIsSaving(true)
    try {
      await api.schedule.assignSlot(assignMatch.id, { courtId: null, datetime: null })
      closeAssign()
      await loadData()
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Result dialog ─────────────────────────────────────────────────────────

  async function openResultDialog(slot: MatchSlot) {
    const m = await api.matches.getById(slot.id)
    if (!m) return
    setResultMatch(m)
    setResultSets(
      m.sets.length > 0
        ? m.sets.map((s) => ({ s1: String(s.s1), s2: String(s.s2) }))
        : [{ s1: '', s2: '' }, { s1: '', s2: '' }]
    )
    setResultStatus(m.status === 'scheduled' || m.status === 'in_progress' ? 'finished' : m.status)
    setResultWinnerId(m.winner_team_id ?? '')
  }

  function closeResultDialog() {
    setResultMatch(null)
  }

  function updateSet(idx: number, field: 's1' | 's2', value: string) {
    setResultSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
  }

  async function handleSaveResult() {
    if (!resultMatch) return
    setIsSavingResult(true)
    try {
      const parsedSets =
        resultStatus === 'walkover'
          ? []
          : resultSets
              .filter((s) => s.s1 !== '' || s.s2 !== '')
              .map((s) => ({ s1: Number(s.s1) || 0, s2: Number(s.s2) || 0 }))

      const dto: UpdateMatchResultDTO = {
        status: resultStatus,
        sets: parsedSets,
        winner_team_id: resultStatus === 'walkover' ? resultWinnerId || null : undefined
      }

      await api.matches.updateResult(resultMatch.id, dto)
      closeResultDialog()
      await loadData()
    } finally {
      setIsSavingResult(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/tournaments/${id}`)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">{tournament?.name}</span>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-lg font-semibold">{t('schedule.title')}</h1>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-6 py-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">{t('schedule.category')}</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-sm"
          >
            <option value="all">{t('schedule.allCategories')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {t(`events.category.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">{t('schedule.stage')}</label>
          <select
            value={roundFilter}
            onChange={(e) => setRoundFilter(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-sm"
          >
            <option value="all">{t('schedule.allStages')}</option>
            {roundOptions.map(([rid, rname]) => (
              <option key={rid} value={rid}>
                {rname}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex min-h-0 flex-1 divide-x overflow-hidden">

        {/* Left column — Unscheduled */}
        <div className="flex w-1/2 flex-col overflow-hidden">
          <div className="border-b bg-muted/20 px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('schedule.unscheduledCount', { count: filteredUnscheduled.length })}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {filteredUnscheduled.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('schedule.noUnscheduled')}</p>
            ) : (
              unscheduledGroups.map((group) => {
                const subLabel =
                  group.roundType === 'round_robin'
                    ? t('schedule.tour', { n: group.subKey })
                    : t('schedule.bracketRound', { n: group.subKey })
                return (
                <div key={`${group.roundId}-${group.sortKey}`}>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    {group.roundName} — {subLabel}
                  </p>
                  <div className="space-y-1.5">
                    {group.matches.map((m) => (
                      <div
                        key={m.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('matchId', m.id)
                          e.dataTransfer.effectAllowed = 'move'
                          setDraggingMatchId(m.id)
                        }}
                        onDragEnd={() => setDraggingMatchId(null)}
                        className={cn(
                          'cursor-grab active:cursor-grabbing',
                          draggingMatchId === m.id && 'opacity-50'
                        )}
                      >
                        <MatchCard
                          match={m}
                          action={
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 shrink-0 px-2 text-xs"
                              onClick={() => openAssign(m)}
                            >
                              {t('schedule.assign')}
                            </Button>
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right column — Scheduled */}
        <div className="flex w-1/2 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-2">
            <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('schedule.scheduledCount', { count: filteredScheduled.length })}
            </h2>
            {scheduledDates.length > 0 && (
              <div className="ml-3 flex items-center gap-1 overflow-x-auto">
                {scheduledDates.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    title={d}
                    className={cn(
                      'shrink-0 rounded px-2.5 py-0.5 text-xs font-medium transition-colors',
                      date === d
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {d.slice(8, 10)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {scheduledByCourt.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('schedule.noCourts')}</p>
            ) : (
              scheduledByCourt.map(({ court, matches }) => {
                const nextSlot = court ? getNextSlot(matches, date) : null
                return (
                <div key={court?.id ?? '__none__'}>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    {court?.name ?? t('schedule.noCourt')}
                  </p>
                  <div className="space-y-1.5">
                    {court && nextSlot && draggingMatchId && (
                      <CourtDropZone
                        courtId={court.id}
                        nextSlot={nextSlot}
                        onDrop={handleDropOnCourt}
                      />
                    )}
                    {matches.map((m) => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        timePrefix={m.scheduledAt ? formatTime(m.scheduledAt) : undefined}
                        action={
                          <div className="flex shrink-0 gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => openResultDialog(m)}
                            >
                              {m.status === 'finished' || m.status === 'walkover' || m.status === 'retired'
                                ? t('matches.editResult')
                                : t('matches.enterResult')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-muted-foreground"
                              onClick={() => openAssign(m)}
                            >
                              {t('common.edit')}
                            </Button>
                          </div>
                        }
                      />
                    ))}
                  </div>
                </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Assign / Edit dialog */}
      <Dialog open={!!assignMatch} onOpenChange={(open) => !open && closeAssign()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {assignMatch?.scheduledAt ? t('schedule.editSlot') : t('schedule.assignTitle')}
            </DialogTitle>
          </DialogHeader>

          {assignMatch && (
            <div className="space-y-4 py-2">
              {/* Match info */}
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <div className="font-medium">
                  {(assignMatch.team1Name ?? t('schedule.tbd'))} {t('schedule.vs')}{' '}
                  {(assignMatch.team2Name ?? t('schedule.tbd'))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t(`events.category.${assignMatch.eventCategory}`)} · {assignMatch.roundName}
                </div>
              </div>

              {/* Court */}
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('schedule.court')}</label>
                <select
                  value={assignCourtId}
                  onChange={(e) => { setAssignCourtId(e.target.value); setConflicts([]) }}
                  className="w-full rounded border bg-background px-3 py-2 text-sm"
                >
                  <option value="">{t('schedule.noCourt')}</option>
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Datetime */}
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('schedule.datetime')}</label>
                <input
                  type="datetime-local"
                  value={assignDatetime}
                  onChange={(e) => { setAssignDatetime(e.target.value); setConflicts([]) }}
                  className="w-full rounded border bg-background px-3 py-2 text-sm"
                />
              </div>

              {/* Conflicts warning */}
              {conflicts.length > 0 && (
                <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t('schedule.conflicts')}
                  </div>
                  <p className="mt-1 text-yellow-700">{t('schedule.conflictsHint')}</p>
                  <ul className="mt-1 list-disc pl-4">
                    {conflicts.map((c) => (
                      <li key={c.matchId}>{formatTime(c.scheduledAt)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {assignMatch?.scheduledAt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUnassign}
                disabled={isSaving}
                className="mr-auto text-muted-foreground"
              >
                {t('schedule.unassign')}
              </Button>
            )}
            <Button variant="outline" onClick={closeAssign} disabled={isSaving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={conflicts.length > 0 ? handleSaveForce : handleSave} disabled={isSaving}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result dialog */}
      <Dialog open={!!resultMatch} onOpenChange={(open) => !open && closeResultDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {resultMatch?.status === 'finished' || resultMatch?.status === 'walkover' || resultMatch?.status === 'retired'
                ? t('matches.editResult')
                : t('matches.enterResult')}
            </DialogTitle>
          </DialogHeader>

          {resultMatch && (
            <div className="space-y-4 py-2">
              {/* Match info */}
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <div className="font-medium">
                  {resultMatch.team1?.name ?? t('schedule.tbd')} {t('schedule.vs')}{' '}
                  {resultMatch.team2?.name ?? t('schedule.tbd')}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('matches.resultStatus')}</label>
                <div className="flex gap-2">
                  {(['finished', 'walkover', 'retired'] as MatchStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setResultStatus(s)}
                      className={cn(
                        'rounded border px-3 py-1 text-xs font-medium transition-colors',
                        resultStatus === s
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:bg-muted'
                      )}
                    >
                      {t(`matches.status.${s}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sets (not for walkover) */}
              {resultStatus !== 'walkover' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('matches.set', { n: '' }).trim()}</label>
                  {resultSets.map((set, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-12 text-xs text-muted-foreground">{t('matches.set', { n: idx + 1 })}</span>
                      <input
                        type="number"
                        min={0}
                        value={set.s1}
                        onChange={(e) => updateSet(idx, 's1', e.target.value)}
                        className="w-16 rounded border bg-background px-2 py-1 text-center text-sm"
                      />
                      <span className="text-muted-foreground">–</span>
                      <input
                        type="number"
                        min={0}
                        value={set.s2}
                        onChange={(e) => updateSet(idx, 's2', e.target.value)}
                        className="w-16 rounded border bg-background px-2 py-1 text-center text-sm"
                      />
                      {resultSets.length > 1 && (
                        <button
                          onClick={() => setResultSets((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          {t('matches.removeSet')}
                        </button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setResultSets((prev) => [...prev, { s1: '', s2: '' }])}
                  >
                    {t('matches.addSet')}
                  </Button>
                </div>
              )}

              {/* Winner (walkover only) */}
              {resultStatus === 'walkover' && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t('matches.winner')}</label>
                  <select
                    value={resultWinnerId}
                    onChange={(e) => setResultWinnerId(e.target.value)}
                    className="w-full rounded border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">{t('matches.selectWinner')}</option>
                    {resultMatch.team1 && (
                      <option value={resultMatch.team1.id}>{resultMatch.team1.name}</option>
                    )}
                    {resultMatch.team2 && (
                      <option value={resultMatch.team2.id}>{resultMatch.team2.name}</option>
                    )}
                  </select>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeResultDialog} disabled={isSavingResult}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveResult} disabled={isSavingResult}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── MatchCard sub-component ──────────────────────────────────────────────────

function MatchCard({
  match,
  timePrefix,
  action
}: {
  match: MatchSlot
  timePrefix?: string
  action?: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
        CATEGORY_COLORS[match.eventCategory] ?? 'bg-gray-50 border-gray-200'
      )}
    >
      {timePrefix && (
        <span className="shrink-0 font-mono font-medium">{timePrefix}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold',
              CATEGORY_BADGE[match.eventCategory] ?? 'bg-gray-100 text-gray-700'
            )}
          >
            {match.eventCategory}
          </span>
          <span className="truncate font-medium">
            {match.team1Name ?? t('schedule.tbd')} {t('schedule.vs')}{' '}
            {match.team2Name ?? t('schedule.tbd')}
          </span>
          {match.s1 !== null && match.s2 !== null && (
            <span className="shrink-0 font-mono font-semibold tabular-nums">
              {match.s1}–{match.s2}
            </span>
          )}
          {(match.status === 'walkover' || match.status === 'retired') && (
            <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
              {t(`matches.status.${match.status}`)}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] opacity-60">{match.roundName}</div>
      </div>
      {action}
    </div>
  )
}

// ─── CourtDropZone sub-component ──────────────────────────────────────────────

function CourtDropZone({
  courtId,
  nextSlot,
  onDrop
}: {
  courtId: string
  nextSlot: string
  onDrop: (matchId: string, courtId: string, datetime: string) => void
}) {
  const { t } = useTranslation()
  const [isOver, setIsOver] = useState(false)

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsOver(true) }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsOver(false)
        const matchId = e.dataTransfer.getData('matchId')
        if (matchId) onDrop(matchId, courtId, nextSlot)
      }}
      className={cn(
        'rounded-lg border-2 border-dashed px-3 py-2.5 text-center text-xs font-medium transition-colors select-none',
        isOver
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50'
      )}
    >
      {isOver
        ? t('schedule.dropZoneActive')
        : t('schedule.dropZoneLabel', { time: formatTime(nextSlot) })}
    </div>
  )
}
