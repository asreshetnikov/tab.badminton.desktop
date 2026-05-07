import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import type { Tournament } from '@shared/types/ipc'

interface ChecklistData {
  hasVenue: boolean
  courtsCount: number
  daySettingsCount: number
  eventsCount: number
  registrationsTotal: number
  registrationsAccepted: number
  entriesCount: number
  eventsWithEntries: number
  roundsCount: number
  eventsWithRounds: number
  matchesTotal: number
  eventsWithMatches: number
  matchesScheduled: number
  eventsWithScheduled: number
  matchesFinished: number
  eventsWithFinished: number
}

interface StepDef {
  label: string
  hint: string
  done: boolean
  countText: string
  phase: 'setup' | 'day'
  optional?: boolean
  onGo?: () => void
  goLabel?: string
}

function buildSteps(d: ChecklistData, id: string, onEdit: () => void, navigate: ReturnType<typeof useNavigate>): StepDef[] {
  const pl = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural)
  // Show "N/N cat." suffix only when there are multiple categories
  const cat = (withData: number) =>
    d.eventsCount > 1 ? ` · ${withData}/${d.eventsCount} cat.` : ''
  return [
    {
      phase: 'setup',
      label: 'Venue',
      hint: 'Assign a venue to the tournament',
      done: d.hasVenue,
      countText: d.hasVenue ? 'Assigned' : 'Not set',
      onGo: onEdit,
      goLabel: 'Edit',
    },
    {
      phase: 'setup',
      label: 'Courts',
      hint: 'Add courts used for scheduling',
      done: d.courtsCount > 0,
      countText: d.courtsCount > 0 ? `${d.courtsCount} ${pl(d.courtsCount, 'court', 'courts')}` : 'No courts',
      onGo: onEdit,
      goLabel: 'Edit',
    },
    {
      phase: 'setup',
      label: 'Day settings',
      hint: 'Configure start time and match duration per day',
      done: d.daySettingsCount > 0,
      countText: d.daySettingsCount > 0
        ? `${d.daySettingsCount} ${pl(d.daySettingsCount, 'day', 'days')} configured`
        : 'Using defaults',
      optional: true,
      onGo: onEdit,
      goLabel: 'Edit',
    },
    {
      phase: 'setup',
      label: 'Categories',
      hint: 'Create event categories: MS, WS, MD, WD, XD',
      done: d.eventsCount > 0,
      countText: d.eventsCount > 0
        ? `${d.eventsCount} ${pl(d.eventsCount, 'category', 'categories')}`
        : 'No categories',
    },
    {
      phase: 'setup',
      label: 'Register players',
      hint: 'Add players to this tournament',
      done: d.registrationsTotal > 0,
      countText: d.registrationsTotal > 0 ? `${d.registrationsTotal} registered` : 'No players',
      onGo: () => navigate(`/tournaments/${id}/players`),
      goLabel: 'Players',
    },
    {
      phase: 'setup',
      label: 'Accept registrations',
      hint: 'Accept pending player applications',
      done: d.registrationsAccepted > 0,
      countText:
        d.registrationsTotal > 0
          ? `${d.registrationsAccepted} / ${d.registrationsTotal} accepted`
          : 'No players',
      onGo: () => navigate(`/tournaments/${id}/players`),
      goLabel: 'Players',
    },
    {
      phase: 'setup',
      label: 'Entries',
      hint: 'Register teams (doubles pairs) in event categories',
      done: d.entriesCount > 0,
      countText:
        d.entriesCount > 0
          ? `${d.entriesCount} ${pl(d.entriesCount, 'entry', 'entries')}${cat(d.eventsWithEntries)}`
          : 'No entries',
      onGo: () => navigate(`/tournaments/${id}/teams`),
      goLabel: 'Entries',
    },
    {
      phase: 'setup',
      label: 'Rounds & participants',
      hint: 'Create round-robin groups and/or playoff brackets and add participants',
      done: d.roundsCount > 0,
      countText:
        d.roundsCount > 0
          ? `${d.roundsCount} ${pl(d.roundsCount, 'round', 'rounds')}${cat(d.eventsWithRounds)}`
          : 'No rounds',
      onGo: () => navigate(`/tournaments/${id}/rounds`),
      goLabel: 'Rounds',
    },
    {
      phase: 'setup',
      label: 'Generate matches',
      hint: 'Generate matches for all rounds',
      done: d.matchesTotal > 0,
      countText:
        d.matchesTotal > 0
          ? `${d.matchesTotal} ${pl(d.matchesTotal, 'match', 'matches')}${cat(d.eventsWithMatches)}`
          : 'No matches',
      onGo: () => navigate(`/tournaments/${id}/rounds`),
      goLabel: 'Rounds',
    },
    {
      phase: 'day',
      label: 'Build schedule',
      hint: 'Assign matches to courts and time slots',
      done: d.matchesScheduled > 0,
      countText:
        d.matchesTotal > 0
          ? `${d.matchesScheduled} / ${d.matchesTotal} scheduled${cat(d.eventsWithScheduled)}`
          : 'No matches yet',
      onGo: () => navigate(`/tournaments/${id}/schedule`),
      goLabel: 'Schedule',
    },
    {
      phase: 'day',
      label: 'Enter results',
      hint: 'Record match results as games are played',
      done: d.matchesFinished > 0,
      countText:
        d.matchesTotal > 0
          ? `${d.matchesFinished} / ${d.matchesTotal} finished${cat(d.eventsWithFinished)}`
          : 'No matches yet',
      onGo: () => navigate(`/tournaments/${id}/schedule`),
      goLabel: 'Schedule',
    },
  ]
}

export function TournamentChecklist({
  tournament,
  onEdit,
  refreshKey,
}: {
  tournament: Tournament
  onEdit: () => void
  refreshKey?: number
}) {
  const navigate = useNavigate()
  const id = tournament.id
  const [data, setData] = useState<ChecklistData | null>(null)
  const [open, setOpen] = useState(true)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [courts, daySettings, events, players, entries, scheduled, unscheduled] =
        await Promise.all([
          api.courts.listByTournament(id),
          api.tournamentDaySettings.listByTournament(id),
          api.events.listByTournament(id),
          api.tournamentPlayers.listByTournament(id),
          api.tournamentTeams.listByTournament(id),
          api.schedule.listScheduled(id),
          api.schedule.listUnscheduled(id),
        ])
      const roundsArr = await Promise.all(events.map((e) => api.rounds.listByEvent(e.id)))
      const allMatches = [...scheduled, ...unscheduled]
      const finished = allMatches.filter((m) => m.status === 'finished' || m.status === 'retired')
      setData({
        hasVenue: tournament.venue_id != null,
        courtsCount: courts.length,
        daySettingsCount: daySettings.length,
        eventsCount: events.length,
        registrationsTotal: players.length,
        registrationsAccepted: players.filter((p) => p.status === 'accepted').length,
        entriesCount: entries.length,
        eventsWithEntries: new Set(entries.map((e) => e.event_id)).size,
        roundsCount: roundsArr.flat().length,
        eventsWithRounds: roundsArr.filter((r) => r.length > 0).length,
        matchesTotal: allMatches.length,
        eventsWithMatches: new Set(allMatches.map((m) => m.eventId)).size,
        matchesScheduled: scheduled.length,
        eventsWithScheduled: new Set(scheduled.map((m) => m.eventId)).size,
        matchesFinished: finished.length,
        eventsWithFinished: new Set(finished.map((m) => m.eventId)).size,
      })
    } finally {
      setLoading(false)
    }
  }, [id, tournament.venue_id])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  if (!data) return null

  const steps = buildSteps(data, id, onEdit, navigate)
  const completedRequired = steps.filter((s) => s.done).length
  const totalRequired = steps.length
  const allDone = completedRequired === totalRequired
  const progressPct = totalRequired > 0 ? (completedRequired / totalRequired) * 100 : 0

  const setupSteps = steps.filter((s) => s.phase === 'setup')
  const daySteps = steps.filter((s) => s.phase === 'day')

  return (
    <div className="mt-6 rounded-lg border text-sm">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          className="flex flex-1 items-center gap-3 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="font-medium">Setup Checklist</span>
          <span className="text-xs text-muted-foreground">
            {completedRequired}/{totalRequired}
          </span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                allDone ? 'bg-green-500' : 'bg-primary'
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        <button
          className={cn(
            'ml-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground',
            loading && 'animate-spin'
          )}
          onClick={load}
          title="Refresh"
          disabled={loading}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Body ── */}
      {open && (
        <div className="border-t">
          <PhaseSection title="Before Tournament" steps={setupSteps} />
          <PhaseSection title="Tournament Day" steps={daySteps} bordered />
        </div>
      )}
    </div>
  )
}

function PhaseSection({
  title,
  steps,
  bordered,
}: {
  title: string
  steps: StepDef[]
  bordered?: boolean
}) {
  return (
    <div className={cn(bordered && 'border-t')}>
      <p className="bg-muted/30 px-4 py-1 text-xs font-medium text-muted-foreground">{title}</p>
      {steps.map((step) => (
        <StepRow key={step.label} step={step} />
      ))}
    </div>
  )
}

function StepRow({ step }: { step: StepDef }) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 hover:bg-muted/20">
      {step.done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
      )}
      <span
        className={cn('flex-1', step.done ? 'text-muted-foreground' : 'font-medium')}
        title={step.hint}
      >
        {step.label}
        {step.optional && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground/60">(optional)</span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">{step.countText}</span>
      {step.onGo && !step.done && (
        <button
          onClick={step.onGo}
          className="text-xs text-primary hover:underline"
        >
          {step.goLabel} →
        </button>
      )}
    </div>
  )
}
