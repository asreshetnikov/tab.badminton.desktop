import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, ChevronRight } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import { statusClass } from '@renderer/features/tournament/status'
import type { Tournament, Event, Round, RoundType } from '@shared/types/ipc'

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
      <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{order}.</span>
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
        className="h-7 shrink-0 rounded-md border border-input bg-background px-2 text-xs"
      >
        {ROUND_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        className="h-7 shrink-0 text-xs"
        disabled={!name.trim() || isSaving}
        onClick={() => name.trim() && onSave(name.trim(), type)}
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
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([api.tournament.getById(id), api.events.listByTournament(id)]).then(
      async ([tournament, events]) => {
        setTournament(tournament)
        setEvents(events)
        const requestedEvent = searchParams.get('event')
        const initialEvent = requestedEvent && events.some((e) => e.id === requestedEvent)
          ? requestedEvent
          : events[0]?.id ?? null
        setActiveEventId(initialEvent)
        const entries = await Promise.all(
          events.map((e) => api.rounds.listByEvent(e.id).then((rounds) => [e.id, rounds] as const))
        )
        setRoundsByEvent(Object.fromEntries(entries))
        setIsLoading(false)
      }
    )
  }, [id])

  const activeRounds = activeEventId ? (roundsByEvent[activeEventId] ?? []) : []

  function switchTab(eventId: string) {
    setActiveEventId(eventId)
    setAdding(false)
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

  async function handleDelete(round: Round) {
    await api.rounds.delete(round.id)
    setRoundsByEvent((prev) => ({
      ...prev,
      [round.event_id]: (prev[round.event_id] ?? []).filter((r) => r.id !== round.id)
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
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                      statusClass[event.category] ?? 'bg-muted text-muted-foreground'
                    )}
                  >
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
              {activeRounds.map((round) => (
                <div
                  key={round.id}
                  className="group flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 hover:bg-muted/40"
                  onClick={() =>
                    navigate(
                      `/tournaments/${id}/events/${round.event_id}/rounds/${round.id}/groups`
                    )
                  }
                >
                  <span className="w-5 text-right text-xs text-muted-foreground">
                    {round.order}.
                  </span>
                  <span className="flex-1 font-medium">{round.name}</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      round.type === 'round_robin'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                    )}
                  >
                    {t(`rounds.type.${round.type}`)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 hover:text-destructive group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(round)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
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
    </div>
  )
}
