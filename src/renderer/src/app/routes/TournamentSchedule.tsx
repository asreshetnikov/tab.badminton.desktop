import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, AlertTriangle, Wand2, Settings2, Plus, Trash2 } from 'lucide-react'
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
import type { Court, MatchSlot, ConflictInfo, Tournament, MatchWithTeams, UpdateMatchResultDTO, TournamentDaySetting, TournamentStageDuration } from '@shared/types/ipc'
import type { MatchStatus } from '@shared/types/match'
import { DEFAULT_START_TIME, DEFAULT_MATCH_DURATION } from '@shared/types/tournament-day-settings'

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


// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  const [daySettings, setDaySettings] = useState<TournamentDaySetting[]>([])
  const [stageDurations, setStageDurations] = useState<TournamentStageDuration[]>([])
  const [priorityByMatch, setPriorityByMatch] = useState<Map<string, number>>(new Map())
  const [isLoading, setIsLoading] = useState(true)

  // Settings panel
  const [showSettings, setShowSettings] = useState(false)
  const [restMinutesDraft, setRestMinutesDraft] = useState('')
  const [newStageBracketRound, setNewStageBracketRound] = useState('')
  const [newStageDurationMins, setNewStageDurationMins] = useState('')
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  // Auto-schedule
  const [isAutoScheduling, setIsAutoScheduling] = useState(false)

  // Filters
  const [date, setDate] = useState(todayIso)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [roundFilter, setRoundFilter] = useState('all')

  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date()
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  })
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))
    }
    const msToNextMinute = (60 - new Date().getSeconds()) * 1000
    const timeout = setTimeout(() => {
      tick()
      const interval = setInterval(tick, 60_000)
      return () => clearInterval(interval)
    }, msToNextMinute)
    return () => clearTimeout(timeout)
  }, [])

  // Assign dialog
  const [assignMatch, setAssignMatch] = useState<MatchSlot | null>(null)
  const [assignCourtId, setAssignCourtId] = useState('')
  const [assignDatetime, setAssignDatetime] = useState('')
  const [assignNotBeforeHard, setAssignNotBeforeHard] = useState('')
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Result dialog
  const [resultMatch, setResultMatch] = useState<MatchWithTeams | null>(null)
  const [resultSets, setResultSets] = useState<{ s1: string; s2: string }[]>([])
  const [resultStatus, setResultStatus] = useState<MatchStatus>('finished')
  const [resultWinnerId, setResultWinnerId] = useState<string>('')
  const [isSavingResult, setIsSavingResult] = useState(false)

  // ─── Load ──────────────────────────────────────────────────────────────────

  async function loadData() {
    if (!id) return
    const [t_, c, s, u, ds, sd, queue] = await Promise.all([
      api.tournament.getById(id),
      api.courts.listByTournament(id),
      api.schedule.listScheduled(id),
      api.schedule.listUnscheduled(id),
      api.tournamentDaySettings.listByTournament(id),
      api.stageDurations.list(id),
      api.schedule.buildQueue(id)
    ])
    setTournament(t_)
    setCourts(c)
    setScheduled(s)
    setUnscheduled(u)
    setDaySettings(ds)
    setStageDurations(sd)
    setRestMinutesDraft(String(t_?.rest_minutes ?? 30))
    const pm = new Map<string, number>()
    queue.forEach((q) => pm.set(q.matchId, q.priority))
    setPriorityByMatch(pm)
    setIsLoading(false)
  }

  function getDaySetting(date: string): { startTime: string; duration: number } {
    const s = daySettings.find((x) => x.date === date)
    return {
      startTime: s?.start_time ?? DEFAULT_START_TIME,
      duration: s?.match_duration ?? DEFAULT_MATCH_DURATION
    }
  }

  useEffect(() => {
    setIsLoading(true)
    loadData()
  }, [id])

  // ─── Filter options ────────────────────────────────────────────────────────

  const allMatches = useMemo(() => [...scheduled, ...unscheduled], [scheduled, unscheduled])

  const maxBracketRoundByRound = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of allMatches) {
      if (m.roundType === 'playoff' && m.bracketRound !== null) {
        const cur = map.get(m.roundId) ?? 0
        if (m.bracketRound > cur) map.set(m.roundId, m.bracketRound)
      }
    }
    return map
  }, [allMatches])

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

  // Unscheduled: filtered, sorted by priority desc → notBeforeSoft asc
  const filteredUnscheduled = useMemo(() => {
    const filtered = unscheduled.filter(matchFilter)
    return filtered.sort((a, b) => {
      const pa = priorityByMatch.get(a.id) ?? -1
      const pb = priorityByMatch.get(b.id) ?? -1
      if (pb !== pa) return pb - pa
      const ta = a.notBeforeSoft ? new Date(a.notBeforeSoft).getTime() : Infinity
      const tb = b.notBeforeSoft ? new Date(b.notBeforeSoft).getTime() : Infinity
      return ta - tb
    })
  }, [unscheduled, categoryFilter, roundFilter, priorityByMatch])
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

  // ─── Auto schedule ─────────────────────────────────────────────────────────

  async function handleAutoSchedule() {
    if (!id) return
    setIsAutoScheduling(true)
    try {
      await api.schedule.autoSchedule(id)
      await loadData()
    } finally {
      setIsAutoScheduling(false)
    }
  }

  // ─── Settings ──────────────────────────────────────────────────────────────

  async function handleSaveSettings() {
    if (!id || !tournament) return
    setIsSavingSettings(true)
    try {
      const restMins = parseInt(restMinutesDraft) || 30
      await api.tournament.update(id, { rest_minutes: restMins })
      await loadData()
    } finally {
      setIsSavingSettings(false)
    }
  }

  async function handleAddStageDuration() {
    if (!id) return
    const bracketRound = parseInt(newStageBracketRound)
    const durationMins = parseInt(newStageDurationMins)
    if (isNaN(bracketRound) || bracketRound < 1 || isNaN(durationMins) || durationMins < 1) return
    await api.stageDurations.upsert(id, bracketRound, { duration_minutes: durationMins })
    setNewStageBracketRound('')
    setNewStageDurationMins('')
    await loadData()
  }

  async function handleDeleteStageDuration(durationId: string) {
    await api.stageDurations.delete(durationId)
    await loadData()
  }

  // ─── Assign dialog ─────────────────────────────────────────────────────────

  function openAssign(match: MatchSlot) {
    setAssignMatch(match)
    setAssignCourtId(match.courtId ?? '')
    setAssignDatetime(match.scheduledAt ?? `${date}T10:00`)
    setAssignNotBeforeHard(match.notBeforeHard ? match.notBeforeHard.slice(0, 16) : '')
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
      const assignDate = assignDatetime.slice(0, 10)
      const { duration: conflictDuration } = getDaySetting(assignDate)
      for (const teamId of [assignMatch.team1Id, assignMatch.team2Id]) {
        if (!teamId || !assignDatetime) continue
        const c = await api.schedule.validateConflicts(assignMatch.id, {
          teamId,
          datetime: assignDatetime,
          duration: conflictDuration
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
    await Promise.all([
      api.schedule.assignSlot(assignMatch.id, {
        courtId: assignCourtId || null,
        datetime: assignDatetime || null
      }),
      api.schedule.setNotBeforeHard(
        assignMatch.id,
        assignNotBeforeHard ? `${assignNotBeforeHard}:00` : null
      )
    ])
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

  function autoFillOpposite(idx: number, field: 's1' | 's2', value: string) {
    const otherField = field === 's1' ? 's2' : 's1'
    const num = parseInt(value, 10)
    setResultSets((prev) =>
      prev.map((s, i) => {
        if (i !== idx || isNaN(num) || s[otherField] !== '') return s
        if (num <= 19) return { ...s, [otherField]: '21' }
        if (num === 20) return { ...s, [otherField]: '22' }
        return s
      })
    )
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
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings((v) => !v)}
            className={cn(showSettings && 'bg-muted')}
          >
            <Settings2 className="mr-1.5 h-4 w-4" />
            {t('schedule.settings')}
          </Button>
          <Button
            size="sm"
            onClick={handleAutoSchedule}
            disabled={isAutoScheduling || courts.length === 0}
            title={courts.length === 0 ? t('schedule.missingCourts') : undefined}
          >
            <Wand2 className="mr-1.5 h-4 w-4" />
            {isAutoScheduling ? t('schedule.autoScheduling') : t('schedule.autoSchedule')}
          </Button>
        </div>
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
        <span className="ml-auto font-mono text-sm font-medium tabular-nums text-muted-foreground">
          {currentTime}
        </span>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b bg-muted/10 px-6 py-4">
          <h3 className="mb-3 text-sm font-semibold">{t('schedule.settingsTitle')}</h3>
          <div className="flex flex-wrap gap-6">
            {/* Rest minutes */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">{t('schedule.restMinutes')}</label>
              <input
                type="number"
                min={0}
                value={restMinutesDraft}
                onChange={(e) => setRestMinutesDraft(e.target.value)}
                className="w-16 rounded border bg-background px-2 py-1 text-sm"
              />
              <span className="text-sm text-muted-foreground">{t('schedule.restMinutesUnit')}</span>
              <Button size="sm" variant="outline" onClick={handleSaveSettings} disabled={isSavingSettings}>
                {t('common.save')}
              </Button>
            </div>

            {/* Stage durations */}
            <div className="flex-1">
              <p className="mb-1.5 text-sm text-muted-foreground">{t('schedule.stageDurations')}</p>
              <div className="flex flex-wrap gap-2">
                {stageDurations
                  .slice()
                  .sort((a, b) => a.bracket_round - b.bracket_round)
                  .map((sd) => (
                    <div key={sd.id} className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs">
                      <span className="text-muted-foreground">{t('schedule.bracketRoundLabel')} {sd.bracket_round}:</span>
                      <span className="font-medium">{sd.duration_minutes} {t('schedule.durationMin')}</span>
                      <button
                        onClick={() => handleDeleteStageDuration(sd.id)}
                        className="ml-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    placeholder="Round"
                    value={newStageBracketRound}
                    onChange={(e) => setNewStageBracketRound(e.target.value)}
                    className="w-16 rounded border bg-background px-2 py-1 text-xs"
                  />
                  <input
                    type="number"
                    min={1}
                    placeholder="min"
                    value={newStageDurationMins}
                    onChange={(e) => setNewStageDurationMins(e.target.value)}
                    className="w-14 rounded border bg-background px-2 py-1 text-xs"
                  />
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleAddStageDuration}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Two-column body */}
      <div className="flex min-h-0 flex-1 divide-x overflow-hidden">

        {/* Left column — Unscheduled */}
        <div className="flex w-1/2 flex-col overflow-hidden">
          <div className="border-b bg-muted/20 px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('schedule.unscheduledCount', { count: filteredUnscheduled.length })}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
            {filteredUnscheduled.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('schedule.noUnscheduled')}</p>
            ) : (
              filteredUnscheduled.map((m) => (
                <div key={m.id}>
                  <MatchCard
                    match={m}
                    priority={priorityByMatch.get(m.id) ?? null}
                    maxBracketRound={maxBracketRoundByRound.get(m.roundId)}
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
              ))
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
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
            {filteredScheduled.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('schedule.noScheduled')}</p>
            ) : (
              filteredScheduled.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  maxBracketRound={maxBracketRoundByRound.get(m.roundId)}
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
              ))
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

              {/* Not before hard */}
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('schedule.notBeforeHard')}</label>
                <p className="text-xs text-muted-foreground">{t('schedule.notBeforeHardHint')}</p>
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={assignNotBeforeHard}
                    onChange={(e) => setAssignNotBeforeHard(e.target.value)}
                    className="flex-1 rounded border bg-background px-3 py-2 text-sm"
                  />
                  {assignNotBeforeHard && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground"
                      onClick={() => setAssignNotBeforeHard('')}
                    >
                      {t('schedule.clearNotBeforeHard')}
                    </Button>
                  )}
                </div>
                {assignMatch?.notBeforeSoft && (
                  <p className="text-xs text-muted-foreground">
                    {t('schedule.notBeforeSoftLabel')}: {formatTime(assignMatch.notBeforeSoft)}
                  </p>
                )}
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
                        onBlur={(e) => autoFillOpposite(idx, 's1', e.target.value)}
                        className="w-16 rounded border bg-background px-2 py-1 text-center text-sm"
                      />
                      <span className="text-muted-foreground">–</span>
                      <input
                        type="number"
                        min={0}
                        value={set.s2}
                        onChange={(e) => updateSet(idx, 's2', e.target.value)}
                        onBlur={(e) => autoFillOpposite(idx, 's2', e.target.value)}
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
  priority,
  maxBracketRound,
  action
}: {
  match: MatchSlot
  timePrefix?: string
  priority?: number | null
  maxBracketRound?: number
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
          {priority !== null && priority !== undefined && (
            <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700"
              title="Scheduling priority">
              {t('schedule.priority', { n: priority })}
            </span>
          )}
          {match.notBeforeHard && (
            <span className="shrink-0 rounded bg-rose-100 px-1 py-0.5 text-[10px] text-rose-700"
              title={`Not before: ${match.notBeforeHard}`}>
              ⏰
            </span>
          )}
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
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] opacity-60">
          {match.courtName && (
            <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-600">
              {match.courtName}
            </span>
          )}
          <span className="truncate">{match.roundName}</span>
          {match.roundType === 'playoff' && match.bracketRound !== null && maxBracketRound !== undefined && (() => {
            const depth = maxBracketRound - match.bracketRound
            const label = depth === 0
              ? t('schedule.bracketFinal')
              : depth === 1
              ? t('schedule.bracketSemiFinal')
              : depth === 2
              ? t('schedule.bracketQuarterFinal')
              : t('schedule.bracketRoundOf', { n: Math.pow(2, depth + 1) })
            return <span className="shrink-0">· {label}</span>
          })()}
          {match.roundType === 'round_robin' && match.tour !== null && (
            <span className="shrink-0">· {t('schedule.tour', { n: match.tour })}</span>
          )}
          {match.notBeforeSoft && !match.scheduledAt && (
            <span className="shrink-0">· {t('schedule.notBeforeSoftLabel')}: {formatTime(match.notBeforeSoft)}</span>
          )}
        </div>
      </div>
      {action}
    </div>
  )
}
