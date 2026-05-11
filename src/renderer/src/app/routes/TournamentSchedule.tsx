import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, AlertTriangle, Wand2, Settings2, Plus, Trash2, List, LayoutGrid, RefreshCw, GripVertical } from 'lucide-react'
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
import { DEFAULT_START_TIME } from '@shared/types/tournament-day-settings'
import { useAppSettings } from '@renderer/contexts/AppSettingsContext'

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
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TournamentSchedule() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { settings: appSettings } = useAppSettings()

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

  // Regenerate
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false)

  // Drag-and-drop (queue → court)
  const [draggedMatchId, setDraggedMatchId] = useState<string | null>(null)
  const [dragOverCourtId, setDragOverCourtId] = useState<string | null>(null)

  // Queue reorder drag-and-drop
  const [queueSelectedIds, setQueueSelectedIds] = useState<Set<string>>(new Set())
  const [queueLastClickId, setQueueLastClickId] = useState<string | null>(null)
  const [queueDragItemId, setQueueDragItemId] = useState<string | null>(null)
  const [queueInsertIdx, setQueueInsertIdx] = useState<number | null>(null)
  const [queueReorderError, setQueueReorderError] = useState<string | null>(null)

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')

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
  const [assignActualStart, setAssignActualStart] = useState('')
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
  const [startMatchError, setStartMatchError] = useState<string | null>(null)
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
      duration: s?.match_duration ?? appSettings.defaultMatchDuration
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

  function canStartMatch(m: MatchSlot): boolean {
    return (m.status === 'scheduled' || m.status === 'ready') && !!m.team1Id && !!m.team2Id
  }

  // Courts that currently have a live match
  const occupiedCourtIds = useMemo(
    () => new Set(allMatches.filter((m) => m.status === 'live' && m.courtId).map((m) => m.courtId!)),
    [allMatches]
  )

  // Courts available for a new live match (no live match currently)
  const availableCourts = useMemo(
    () => courts.filter((c) => !occupiedCourtIds.has(c.id)),
    [courts, occupiedCourtIds]
  )

  // Left column: scheduled/ready — waiting to be called to court
  // Sorted by queue_position (primary), then scheduledAt, then priority
  const filteredUnscheduled = useMemo(() => {
    const filtered = allMatches.filter(
      (m) => (m.status === 'scheduled' || m.status === 'ready') && matchFilter(m)
    )
    return filtered.sort((a, b) => {
      // Primary sort: queue_position (null → end)
      const qa = a.queuePosition
      const qb = b.queuePosition
      if (qa !== null && qb !== null) return qa - qb
      if (qa !== null) return -1
      if (qb !== null) return 1
      // Fallback for matches without a position: scheduledAt then priority
      const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity
      const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity
      if (ta !== tb) return ta - tb
      const pa = priorityByMatch.get(a.id) ?? -1
      const pb = priorityByMatch.get(b.id) ?? -1
      return pb - pa
    })
  }, [allMatches, categoryFilter, roundFilter, priorityByMatch])

  // ─── Bracket order validation ─────────────────────────────────────────────

  /**
   * Checks that for every playoff match in the proposed order, both of its
   * prerequisite matches (left_match_id / right_match_id) appear before it.
   * Returns a human-readable description of the first violation found, or null.
   */
  function checkBracketOrder(proposed: MatchSlot[]): string | null {
    const posById = new Map(proposed.map((m, i) => [m.id, i]))
    for (const m of proposed) {
      for (const prereqId of [m.leftMatchId, m.rightMatchId]) {
        if (!prereqId) continue
        const prereqPos = posById.get(prereqId)
        if (prereqPos === undefined) continue // not in queue (done or filtered out)
        if (prereqPos > posById.get(m.id)!) {
          const prereq = proposed[prereqPos]
          const mName = m.team1Name && m.team2Name
            ? `${m.team1Name} – ${m.team2Name}`
            : t('schedule.tbd')
          const prereqName = prereq.team1Name && prereq.team2Name
            ? `${prereq.team1Name} – ${prereq.team2Name}`
            : t('schedule.bracketMatchTbd')
          return t('schedule.queueBracketConflict', { match: mName, prereq: prereqName })
        }
      }
    }
    return null
  }

  /**
   * Build the proposed newOrder for a given insertIdx.
   * Shared by the real-time drag validation and the final drop handler.
   */
  function computeNewOrder(insertIdx: number, dragItemId: string, selectedIds: Set<string>): MatchSlot[] {
    const items = filteredUnscheduled
    const effectiveSelectedIds = selectedIds.has(dragItemId) ? selectedIds : new Set([dragItemId])
    const selectedInOrder = items.filter((m) => effectiveSelectedIds.has(m.id))
    const notSelected = items.filter((m) => !effectiveSelectedIds.has(m.id))
    const nsIdx = items.slice(0, insertIdx).filter((m) => !effectiveSelectedIds.has(m.id)).length
    return [...notSelected.slice(0, nsIdx), ...selectedInOrder, ...notSelected.slice(nsIdx)]
  }

  /**
   * Checks that the scheduled time of each moved match does not violate the
   * time constraint imposed by its unfinished bracket prerequisites:
   *   match.scheduledAt >= prereq.scheduledAt + matchDuration + restMinutes
   *
   * This is independent of queue position — it checks absolute scheduled times.
   * Returns a human-readable error string or null.
   */
  function checkTimeConstraints(movedMatchIds: Set<string>): string | null {
    const restMins = tournament?.rest_minutes ?? 30
    for (const matchId of movedMatchIds) {
      const m = allMatches.find((x) => x.id === matchId)
      if (!m?.scheduledAt) continue
      for (const prereqId of [m.leftMatchId, m.rightMatchId]) {
        if (!prereqId) continue
        const prereq = allMatches.find((x) => x.id === prereqId)
        if (!prereq?.scheduledAt) continue
        if (prereq.status === 'finished' || prereq.status === 'walkover' || prereq.status === 'retired') continue
        // prereq is unfinished and has a scheduled time — check minimum start
        const prereqDate = prereq.scheduledAt.slice(0, 10)
        const { duration } = getDaySetting(prereqDate)
        const minStartMs = new Date(prereq.scheduledAt).getTime() + (duration + restMins) * 60 * 1000
        const matchStartMs = new Date(m.scheduledAt).getTime()
        if (matchStartMs < minStartMs) {
          const mName =
            m.team1Name && m.team2Name ? `${m.team1Name} – ${m.team2Name}` : t('schedule.tbd')
          const prereqName =
            prereq.team1Name && prereq.team2Name
              ? `${prereq.team1Name} – ${prereq.team2Name}`
              : t('schedule.bracketMatchTbd')
          const minTimeStr = new Date(minStartMs).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          })
          const matchTimeStr = formatTime(m.scheduledAt)
          return t('schedule.queueTimeConflict', {
            match: mName,
            matchTime: matchTimeStr,
            prereq: prereqName,
            minTime: minTimeStr
          })
        }
      }
    }
    return null
  }

  /** True when the current drag hover position would violate bracket ordering or time constraints. */
  const queueInsertIsInvalid = useMemo(() => {
    if (queueDragItemId === null || queueInsertIdx === null) return false
    const proposed = computeNewOrder(queueInsertIdx, queueDragItemId, queueSelectedIds)
    if (checkBracketOrder(proposed) !== null) return true
    const effectiveIds = queueSelectedIds.has(queueDragItemId)
      ? queueSelectedIds
      : new Set([queueDragItemId])
    return checkTimeConstraints(effectiveIds) !== null
  }, [queueDragItemId, queueInsertIdx, queueSelectedIds, filteredUnscheduled, tournament, daySettings])

  // Right column: live/finished/walkover/retired — active or completed matches
  const rightMatches = useMemo(
    () => allMatches.filter((m) => m.status !== 'scheduled' && m.status !== 'ready'),
    [allMatches]
  )

  // Unique sorted dates from right-column matches
  const scheduledDates = useMemo(() => {
    const dates = new Set(
      rightMatches.map((m) => m.scheduledAt?.slice(0, 10)).filter(Boolean) as string[]
    )
    return [...dates].sort()
  }, [rightMatches])

  // Auto-select first available date when data loads (if current date has no matches)
  useEffect(() => {
    if (scheduledDates.length > 0 && !scheduledDates.includes(date)) {
      setDate(scheduledDates[0])
    }
  }, [scheduledDates])

  // Right column filtered by selected date + other filters
  // Sort descending by actual start (if recorded), falling back to scheduled time
  const filteredScheduled = useMemo(
    () =>
      rightMatches
        .filter((m) => m.scheduledAt?.startsWith(date) && matchFilter(m))
        .sort((a, b) => {
          const ta = a.actualStart ?? a.scheduledAt ?? ''
          const tb = b.actualStart ?? b.scheduledAt ?? ''
          return tb.localeCompare(ta)
        }),
    [rightMatches, date, categoryFilter, roundFilter]
  )

  // All dates that have at least one match with scheduledAt (for timeline tabs)
  const timelineDates = useMemo(() => {
    const dates = new Set(
      allMatches.filter((m) => m.scheduledAt).map((m) => m.scheduledAt!.slice(0, 10))
    )
    return [...dates].sort()
  }, [allMatches])

  // All matches with scheduledAt on selected date (any status) for timeline view
  const timelineMatches = useMemo(
    () =>
      allMatches
        .filter((m) => m.scheduledAt?.startsWith(date) && matchFilter(m))
        .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '')),
    [allMatches, date, categoryFilter, roundFilter]
  )

  // Auto-select first timeline date when switching to timeline view
  useEffect(() => {
    if (viewMode !== 'timeline') return
    if (timelineDates.length > 0 && !timelineDates.includes(date)) {
      setDate(timelineDates[0])
    }
  }, [viewMode, timelineDates])

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

  // ─── Regenerate all matches ────────────────────────────────────────────────

  const hasPlayedMatches = useMemo(
    () => allMatches.some((m) => m.status === 'finished' || m.status === 'walkover' || m.status === 'retired'),
    [allMatches]
  )

  async function handleRegenerate() {
    if (!id) return
    setRegenConfirmOpen(false)
    setIsRegenerating(true)
    try {
      await api.matches.regenerateForTournament(id)
    } finally {
      await loadData()
      setIsRegenerating(false)
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
    setAssignDatetime(match.scheduledAt ? match.scheduledAt.slice(0, 16) : `${date}T10:00`)
    setAssignNotBeforeHard(match.notBeforeHard ? match.notBeforeHard.slice(0, 16) : '')
    if ((match.status === 'scheduled' || match.status === 'ready') && match.team1Id && match.team2Id) {
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      setAssignActualStart(
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
      )
    } else {
      setAssignActualStart('')
    }
    setConflicts([])
  }

  function closeAssign() {
    setAssignMatch(null)
    setConflicts([])
    setStartMatchError(null)
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

  async function handleStartMatch() {
    if (!assignMatch || !assignCourtId) return
    setStartMatchError(null)
    setIsSaving(true)
    try {
      await Promise.all([
        api.schedule.assignSlot(assignMatch.id, {
          courtId: assignCourtId,
          datetime: assignDatetime || null
        }),
        api.schedule.setNotBeforeHard(assignMatch.id, assignNotBeforeHard ? `${assignNotBeforeHard}:00` : null)
      ])
      const actualStartIso = assignActualStart || undefined
      await api.matches.startMatch(assignMatch.id, actualStartIso)
      closeAssign()
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('COURT_BUSY')) {
        setStartMatchError(t('schedule.courtBusy'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Queue reorder ────────────────────────────────────────────────────────

  function handleQueueCardClick(e: React.MouseEvent, matchId: string) {
    // Don't select when clicking interactive children (buttons, inputs, etc.)
    if ((e.target as HTMLElement).closest('button, input, select, a')) return
    e.preventDefault()
    if (e.shiftKey && queueLastClickId) {
      const ids = filteredUnscheduled.map((m) => m.id)
      const fromIdx = ids.indexOf(queueLastClickId)
      const toIdx = ids.indexOf(matchId)
      const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
      setQueueSelectedIds((prev) => {
        const next = new Set(prev)
        for (let i = start; i <= end; i++) next.add(ids[i])
        return next
      })
    } else if (e.ctrlKey || e.metaKey) {
      setQueueSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(matchId)) next.delete(matchId)
        else next.add(matchId)
        return next
      })
      setQueueLastClickId(matchId)
    } else {
      // Single click: toggle off if already the only item selected, else select just this
      setQueueSelectedIds((prev) => {
        if (prev.size === 1 && prev.has(matchId)) return new Set()
        return new Set([matchId])
      })
      setQueueLastClickId(matchId)
    }
  }

  async function handleQueueReorder(insertIdx: number) {
    if (queueDragItemId === null) return

    const newOrder = computeNewOrder(insertIdx, queueDragItemId, queueSelectedIds)
    const items = filteredUnscheduled

    console.log('[queue] reorder | insertIdx', insertIdx, '| drag', queueDragItemId, '| selected', [...queueSelectedIds])
    console.log('[queue] proposed order:', newOrder.map((m, i) => `${i}:${m.id.slice(0,8)}`).join(' '))

    // Validate bracket ordering constraints
    const bracketError = checkBracketOrder(newOrder)
    if (bracketError) {
      console.log('[queue] bracket violation →', bracketError)
      setQueueReorderError(bracketError)
      setQueueDragItemId(null)
      setQueueInsertIdx(null)
      return
    }

    // Validate time constraints (match cannot be scheduled before prerequisite finishes + rest)
    const effectiveIds = queueSelectedIds.has(queueDragItemId)
      ? queueSelectedIds
      : new Set([queueDragItemId])
    const timeError = checkTimeConstraints(effectiveIds)
    if (timeError) {
      console.log('[queue] time constraint violation →', timeError)
      setQueueReorderError(timeError)
      setQueueDragItemId(null)
      setQueueInsertIdx(null)
      return
    }

    // No-op if order didn't change
    if (newOrder.every((m, i) => m.id === items[i].id)) {
      console.log('[queue] no-op: order unchanged')
      setQueueDragItemId(null)
      setQueueInsertIdx(null)
      return
    }

    console.log('[queue] saving new positions...')

    const effectiveSelectedIds = queueSelectedIds.has(queueDragItemId)
      ? queueSelectedIds
      : new Set([queueDragItemId])
    const selectedInOrder = newOrder.filter((m) => effectiveSelectedIds.has(m.id))

    // Assign sequential queue_position values matching the new order.
    // scheduledAt is intentionally left unchanged.
    await api.schedule.setQueuePositions(newOrder.map((m, i) => ({ matchId: m.id, position: i })))
    await loadData()

    // Keep moved items highlighted after drop
    setQueueSelectedIds(new Set(selectedInOrder.map((m) => m.id)))
    setQueueDragItemId(null)
    setQueueInsertIdx(null)
  }

  // ─── Drag-and-drop: drop on court ─────────────────────────────────────────

  async function handleDropOnCourt(courtId: string) {
    const match = draggedMatchId ? allMatches.find((m) => m.id === draggedMatchId) : null
    setDraggedMatchId(null)
    setDragOverCourtId(null)
    if (!match || !canStartMatch(match)) return
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const actualStart =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    await api.schedule.assignSlot(match.id, { courtId, datetime: match.scheduledAt || null })
    await api.matches.startMatch(match.id, actualStart)
    await loadData()
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
    setResultStatus(m.status === 'scheduled' || m.status === 'ready' || m.status === 'live' ? 'finished' : m.status)
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
    const pts = tournament?.points_per_set ?? 21
    setResultSets((prev) =>
      prev.map((s, i) => {
        if (i !== idx || isNaN(num) || s[otherField] !== '') return s
        if (num <= pts - 2) return { ...s, [otherField]: String(pts) }
        if (num === pts - 1) return { ...s, [otherField]: String(pts + 1) }
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
          {/* View toggle */}
          <div className="flex overflow-hidden rounded-md border">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 rounded-none"
              onClick={() => setViewMode('list')}
              title={t('schedule.viewList')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 rounded-none border-l"
              onClick={() => setViewMode('timeline')}
              title={t('schedule.viewTimeline')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings((v) => !v)}
            className={cn(showSettings && 'bg-muted')}
          >
            <Settings2 className="mr-1.5 h-4 w-4" />
            {t('schedule.settings')}
          </Button>
          {!hasPlayedMatches && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRegenConfirmOpen(true)}
              disabled={isRegenerating}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              {t('schedule.regenerate')}
            </Button>
          )}
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

      {/* Body */}
      {viewMode === 'timeline' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Date tabs */}
          <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-2">
            <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('schedule.timeline')}
            </h2>
            {timelineDates.length > 0 && (
              <div className="ml-3 flex items-center gap-1 overflow-x-auto">
                {timelineDates.map((d) => (
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
            {unscheduled.filter((m) => m.status === 'scheduled' || m.status === 'ready').length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {t('schedule.unscheduledCount', {
                  count: unscheduled.filter((m) => m.status === 'scheduled' || m.status === 'ready').length
                })}
              </span>
            )}
          </div>
          {/* Timeline grid */}
          <div className="flex-1 overflow-y-auto">
            <TimelineView
              matches={timelineMatches}
              maxBracketRoundByRound={maxBracketRoundByRound}
              onOpenAssign={openAssign}
              onOpenResult={openResultDialog}
            />
          </div>
        </div>
      ) : (

      /* Two-column body */
      <div className="flex min-h-0 flex-1 divide-x overflow-hidden">

        {/* Left column — Queue */}
        <div className="flex w-1/2 flex-col overflow-hidden">
          <div className="border-b bg-muted/20 px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('schedule.unscheduledCount', { count: filteredUnscheduled.length })}
              {queueSelectedIds.size > 1 && (
                <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  {queueSelectedIds.size} {t('schedule.selected')}
                </span>
              )}
            </h2>
            {queueReorderError && (
              <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-xs text-orange-800">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{queueReorderError}</span>
                <button
                  onClick={() => setQueueReorderError(null)}
                  className="shrink-0 text-orange-500 hover:text-orange-700"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <div
            className="flex-1 overflow-y-auto px-4 py-3"
            onDragLeave={(e) => {
              // Only clear when mouse truly leaves the container
              const rect = e.currentTarget.getBoundingClientRect()
              if (
                e.clientX < rect.left || e.clientX > rect.right ||
                e.clientY < rect.top || e.clientY > rect.bottom
              ) {
                setQueueInsertIdx(null)
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (queueDragItemId !== null) {
                void handleQueueReorder(queueInsertIdx ?? filteredUnscheduled.length)
              }
            }}
          >
            {filteredUnscheduled.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('schedule.noUnscheduled')}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filteredUnscheduled.map((m, idx) => {
                  const isSelected = queueSelectedIds.has(m.id)
                  const isDragging = queueDragItemId !== null
                  const isBeingDragged = isDragging && queueSelectedIds.has(m.id) && queueDragItemId !== null &&
                    (queueDragItemId === m.id || queueSelectedIds.has(queueDragItemId))
                  return (
                    <div key={m.id}>
                      {/* Drop indicator above this item */}
                      {isDragging && queueInsertIdx === idx && (
                        <div className={cn('mb-1 h-0.5 rounded-full', queueInsertIsInvalid ? 'bg-destructive' : 'bg-primary')} />
                      )}
                      <div
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          setDraggedMatchId(m.id)
                          setQueueDragItemId(m.id)
                          // If dragging an item outside the current selection, don't clear
                          // the selection — just drag this item alone (selection stays visible
                          // but won't participate in the move)
                          console.log('[DnD] dragStart id=%s inSelection=%s selected=[%s]', m.id, queueSelectedIds.has(m.id), [...queueSelectedIds].join(','))
                        }}
                        onDragEnd={() => {
                          console.log('[DnD] dragEnd dragItemId=%s insertIdx=%s', queueDragItemId, queueInsertIdx)
                          setDraggedMatchId(null)
                          setDragOverCourtId(null)
                          setQueueDragItemId(null)
                          setQueueInsertIdx(null)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setDragOverCourtId(null)
                          const rect = e.currentTarget.getBoundingClientRect()
                          const midY = rect.top + rect.height / 2
                          const next = e.clientY < midY ? idx : idx + 1
                          if (next !== queueInsertIdx) {
                            console.log('[DnD] dragOver itemIdx=%d → insertIdx=%d (y=%.0f mid=%.0f)', idx, next, e.clientY, midY)
                          }
                          setQueueInsertIdx(next)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          // Compute insert position fresh from mouse coords — avoids stale closure on queueInsertIdx
                          const rect = e.currentTarget.getBoundingClientRect()
                          const dropIdx = e.clientY < rect.top + rect.height / 2 ? idx : idx + 1
                          console.log('[DnD] drop on itemIdx=%d dropIdx=%d dragItemId=%s selected=%s', idx, dropIdx, queueDragItemId, [...queueSelectedIds].join(','))
                          if (queueDragItemId !== null) {
                            void handleQueueReorder(dropIdx)
                          }
                        }}
                        onClick={(e) => handleQueueCardClick(e, m.id)}
                        className={cn(
                          'cursor-grab active:cursor-grabbing rounded-lg transition-opacity',
                          isSelected && 'ring-2 ring-primary ring-offset-1',
                          isBeingDragged && 'opacity-40'
                        )}
                      >
                        <MatchCard
                          match={m}
                          priority={priorityByMatch.get(m.id) ?? null}
                          maxBracketRound={maxBracketRoundByRound.get(m.roundId)}
                          timePrefix={m.scheduledAt ? formatTime(m.scheduledAt) : undefined}
                          action={
                            <div className="flex shrink-0 items-center gap-1">
                              <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                onClick={() => openAssign(m)}
                              >
                                {t('schedule.assign')}
                              </Button>
                            </div>
                          }
                        />
                      </div>
                    </div>
                  )
                })}
                {/* Drop indicator at end of list */}
                {queueDragItemId !== null && queueInsertIdx === filteredUnscheduled.length && (
                  <div className={cn('h-0.5 rounded-full', queueInsertIsInvalid ? 'bg-destructive' : 'bg-primary')} />
                )}
              </div>
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
            {/* Court drop zones — always shown at top for courts without a live match */}
            {availableCourts.length > 0 && (
              <div className="mb-2 flex flex-col gap-1.5">
                {availableCourts.map((court) => {
                  const isOver = dragOverCourtId === court.id
                  const isDragging = draggedMatchId !== null
                  return (
                    <div
                      key={court.id}
                      onDragOver={(e) => { e.preventDefault(); setDragOverCourtId(court.id); setQueueInsertIdx(null) }}
                      onDragLeave={() => setDragOverCourtId(null)}
                      onDrop={() => handleDropOnCourt(court.id)}
                      className={cn(
                        'flex min-h-[2.625rem] items-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-xs transition-colors',
                        isOver
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : isDragging
                          ? 'border-green-300 bg-green-50/50 text-green-600'
                          : 'border-muted-foreground/25 text-muted-foreground'
                      )}
                    >
                      <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-600">
                        {court.name}
                      </span>
                      <span>{isOver ? t('schedule.dropToStart') : t('schedule.courtFree')}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {filteredScheduled.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('schedule.noScheduled')}</p>
            ) : (
              filteredScheduled.map((m) => {
                const elapsedMinutes =
                  m.status === 'live' && m.actualStart
                    ? Math.floor((Date.now() - new Date(m.actualStart).getTime()) / 60_000)
                    : (m.status === 'finished' || m.status === 'retired' || m.status === 'walkover') && m.actualStart && m.actualEnd
                    ? Math.floor((new Date(m.actualEnd).getTime() - new Date(m.actualStart).getTime()) / 60_000)
                    : undefined
                return (
                <MatchCard
                  key={m.id}
                  match={m}
                  maxBracketRound={maxBracketRoundByRound.get(m.roundId)}
                  elapsedMinutes={elapsedMinutes}
                  timePrefix={
                    m.actualStart
                      ? formatTime(m.actualStart)
                      : m.scheduledAt
                      ? formatTime(m.scheduledAt)
                      : undefined
                  }
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
                )
              })
            )}
          </div>
        </div>
      </div>
      )} {/* end viewMode === 'timeline' ? ... : */}

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

              {/* Actual start — shown only when both teams are known */}
              {(assignMatch?.status === 'scheduled' || assignMatch?.status === 'ready') &&
               assignMatch.team1Id && assignMatch.team2Id && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t('schedule.actualStart')}</label>
                  <input
                    type="datetime-local"
                    value={assignActualStart}
                    onChange={(e) => setAssignActualStart(e.target.value)}
                    className="w-full rounded border bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}

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

          {startMatchError && (
            <div className="mx-6 mb-2 flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {startMatchError}
            </div>
          )}

          <DialogFooter className="gap-2">
            <div className="mr-auto flex gap-2">
              {assignMatch?.scheduledAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUnassign}
                  disabled={isSaving}
                  className="text-muted-foreground"
                >
                  {t('schedule.unassign')}
                </Button>
              )}
              {(assignMatch?.status === 'scheduled' || assignMatch?.status === 'ready') &&
               assignMatch.team1Id && assignMatch.team2Id && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleStartMatch}
                  disabled={isSaving || !assignCourtId}
                  title={!assignCourtId ? 'Select a court first' : undefined}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {t('schedule.startMatch')}
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={closeAssign} disabled={isSaving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={conflicts.length > 0 ? handleSaveForce : handleSave} disabled={isSaving}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate confirmation dialog */}
      <Dialog open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('schedule.regenerateTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('schedule.regenerateDescription')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRegenerate}>
              {t('schedule.regenerate')}
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
  elapsedMinutes,
  priority,
  maxBracketRound,
  action
}: {
  match: MatchSlot
  timePrefix?: string
  elapsedMinutes?: number
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
      {(timePrefix || elapsedMinutes !== undefined) && (
        <div className="shrink-0 flex flex-col items-center">
          {timePrefix && (
            <span className="font-mono font-medium leading-none">{timePrefix}</span>
          )}
          {elapsedMinutes !== undefined && (
            <span className="mt-0.5 text-[11px] leading-none opacity-60">{elapsedMinutes}'</span>
          )}
        </div>
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
            <span className={cn(match.winnerTeamId === match.team1Id && match.team1Id && 'font-semibold')}>
              {match.team1Name ?? t('schedule.tbd')}
            </span>
            {' '}{t('schedule.vs')}{' '}
            <span className={cn(match.winnerTeamId === match.team2Id && match.team2Id && 'font-semibold')}>
              {match.team2Name ?? t('schedule.tbd')}
            </span>
          </span>
          {match.sets.length > 0 && (
            <span className="shrink-0 font-mono tabular-nums">
              {match.sets.map((s, i) => <span key={i}>{i > 0 && ' '}<span className={s.s1 > s.s2 ? 'font-semibold' : ''}>{s.s1}</span>{'–'}<span className={s.s2 > s.s1 ? 'font-semibold' : ''}>{s.s2}</span></span>)}
            </span>
          )}
          {match.status === 'live' && (
            <span className="shrink-0 rounded bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {t('matches.status.live')}
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

// ─── Timeline utilities ───────────────────────────────────────────────────────

function buildTimeSlots(matches: MatchSlot[]): string[] {
  const slots = new Set(matches.map((m) => m.scheduledAt!.slice(11, 16)))
  return [...slots].sort()
}

function groupBySlot(matches: MatchSlot[]): Map<string, MatchSlot[]> {
  const map = new Map<string, MatchSlot[]>()
  for (const m of matches) {
    if (!m.scheduledAt) continue
    const slot = m.scheduledAt.slice(11, 16)
    if (!map.has(slot)) map.set(slot, [])
    map.get(slot)!.push(m)
  }
  return map
}

// ─── TimelineView component ───────────────────────────────────────────────────

function TimelineView({
  matches,
  maxBracketRoundByRound,
  onOpenAssign,
  onOpenResult,
}: {
  matches: MatchSlot[]
  maxBracketRoundByRound: Map<string, number>
  onOpenAssign: (m: MatchSlot) => void
  onOpenResult: (m: MatchSlot) => void
}) {
  const { t } = useTranslation()
  const slots = buildTimeSlots(matches)
  const bySlot = groupBySlot(matches)

  if (matches.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        {t('schedule.noTimelineMatches')}
      </div>
    )
  }

  return (
    <div className="p-4">
      {slots.map((slot) => {
        const slotMatches = bySlot.get(slot) ?? []
        return (
          <div key={slot} className="flex min-h-[3.5rem] gap-3 border-b py-2 last:border-0">
            <div
              className={cn(
                'w-14 shrink-0 pt-1.5 font-mono text-sm tabular-nums',
                slotMatches.length > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground/40'
              )}
            >
              {slot}
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              {slotMatches.map((m) => (
                <TimelineMatchCard
                  key={m.id}
                  match={m}
                  maxBracketRound={maxBracketRoundByRound.get(m.roundId)}
                  onEdit={() => onOpenAssign(m)}
                  onResult={() => onOpenResult(m)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── TimelineMatchCard component ──────────────────────────────────────────────

function TimelineMatchCard({
  match,
  maxBracketRound,
  onEdit,
  onResult,
}: {
  match: MatchSlot
  maxBracketRound?: number
  onEdit: () => void
  onResult: () => void
}) {
  const { t } = useTranslation()
  const isActive =
    match.status === 'live' ||
    match.status === 'finished' ||
    match.status === 'walkover' ||
    match.status === 'retired'

  const bracketLabel =
    match.roundType === 'playoff' && match.bracketRound !== null && maxBracketRound !== undefined
      ? (() => {
          const depth = maxBracketRound - match.bracketRound
          return depth === 0
            ? t('schedule.bracketFinal')
            : depth === 1
            ? t('schedule.bracketSemiFinal')
            : depth === 2
            ? t('schedule.bracketQuarterFinal')
            : t('schedule.bracketRoundOf', { n: Math.pow(2, depth + 1) })
        })()
      : null

  return (
    <div
      className={cn(
        'flex w-44 cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2 text-xs transition-colors hover:brightness-95',
        CATEGORY_COLORS[match.eventCategory] ?? 'bg-gray-50 border-gray-200'
      )}
      onClick={isActive ? onResult : onEdit}
    >
      {/* Category + status + court */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold',
            CATEGORY_BADGE[match.eventCategory] ?? 'bg-gray-100 text-gray-700'
          )}
        >
          {match.eventCategory}
        </span>
        {match.status === 'live' && (
          <span className="rounded bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {t('matches.status.live')}
          </span>
        )}
        {(match.status === 'finished' || match.status === 'walkover' || match.status === 'retired') && (
          <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
            {t(`matches.status.${match.status}`)}
          </span>
        )}
        {match.courtName && (
          <span className="ml-auto shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-600">
            {match.courtName}
          </span>
        )}
      </div>

      {/* Teams */}
      <div className="leading-snug">
        <div className={cn('truncate font-medium', match.winnerTeamId === match.team1Id && match.team1Id && 'font-semibold')}>
          {match.team1Name ?? t('schedule.tbd')}
        </div>
        <div className={cn('truncate font-medium', match.winnerTeamId === match.team2Id && match.team2Id && 'font-semibold')}>
          {match.team2Name ?? t('schedule.tbd')}
        </div>
      </div>

      {/* Score */}
      {match.sets.length > 0 && (
        <div className="font-mono tabular-nums">
          {match.sets.map((s, i) => <span key={i}>{i > 0 && ' '}<span className={s.s1 > s.s2 ? 'font-semibold' : ''}>{s.s1}</span>{'–'}<span className={s.s2 > s.s1 ? 'font-semibold' : ''}>{s.s2}</span></span>)}
        </div>
      )}

      {/* Round + bracket/tour label */}
      <div className="truncate text-[11px] opacity-60">
        {match.roundName}
        {bracketLabel && ` · ${bracketLabel}`}
        {match.roundType === 'round_robin' && match.tour !== null && ` · ${t('schedule.tour', { n: match.tour })}`}
      </div>
    </div>
  )
}
