import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GripVertical, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { useTranslation } from 'react-i18next'
import { EVENT_CATEGORIES } from '@shared/types/event'
import type { Event, EventCategory } from '@shared/types/ipc'

interface Props {
  tournamentId: string
  defaultAgeMin?: number | null
  defaultAgeMax?: number | null
  onEventsChange?: () => void
}

function buildAutoName(cat: EventCategory, type: 'none' | 'under' | 'over', val: string) {
  const age = val.trim() ? parseInt(val, 10) : NaN
  if (type === 'under' && !isNaN(age)) return `${cat} U${age}`
  if (type === 'over' && !isNaN(age)) return `${cat} ${age}+`
  return cat
}

export function EventList({ tournamentId, defaultAgeMin, defaultAgeMax, onEventsChange }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [events, setEvents] = useState<Event[]>([])
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({})
  const [roundCounts, setRoundCounts] = useState<Record<string, number>>({})
  const [category, setCategory] = useState<EventCategory>('MS')
  const initAgeType = defaultAgeMin != null ? 'over' : defaultAgeMax != null ? 'under' : 'none' as const
  const initAgeValue = defaultAgeMin != null ? String(defaultAgeMin) : defaultAgeMax != null ? String(defaultAgeMax + 1) : ''
  const [name, setName] = useState(() => buildAutoName('MS', initAgeType, initAgeValue))
  const [nameEdited, setNameEdited] = useState(false)
  const [maxEntries, setMaxEntries] = useState('')
  const [ageType, setAgeType] = useState<'none' | 'under' | 'over'>(initAgeType)
  const [ageValue, setAgeValue] = useState(initAgeValue)
  const [showForm, setShowForm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  function handleCategoryChange(cat: EventCategory) {
    setCategory(cat)
    if (!nameEdited) setName(buildAutoName(cat, ageType, ageValue))
  }

  function startEditing(event: Event) {
    setEditingId(event.id)
    setEditingName(event.name)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  async function commitEdit(id: string) {
    const trimmed = editingName.trim()
    if (!trimmed) {
      cancelEdit()
      return
    }
    const updated = await api.events.update(id, { name: trimmed })
    setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)))
    setEditingId(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingName('')
  }

  useEffect(() => {
    api.events.listByTournament(tournamentId).then(setEvents)
  }, [tournamentId])

  useEffect(() => {
    if (events.length === 0) return
    api.tournamentTeams.listByTournament(tournamentId).then((entries) => {
      const counts: Record<string, number> = {}
      entries.forEach((e) => { counts[e.event_id] = (counts[e.event_id] ?? 0) + 1 })
      setEntryCounts(counts)
    })
    Promise.all(events.map((e) => api.rounds.listByEvent(e.id))).then((roundsArr) => {
      const counts: Record<string, number> = {}
      events.forEach((e, i) => { counts[e.id] = roundsArr[i].length })
      setRoundCounts(counts)
    })
  }, [events, tournamentId])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setIsAdding(true)
    try {
      const parsed = maxEntries.trim() ? parseInt(maxEntries, 10) : null
      const parsedAgeVal = ageValue.trim() ? parseInt(ageValue, 10) : null
      const ageMin = ageType === 'over' && parsedAgeVal ? parsedAgeVal : null
      const ageMax = ageType === 'under' && parsedAgeVal ? parsedAgeVal - 1 : null
      const event = await api.events.create({
        tournament_id: tournamentId,
        name: name.trim() || t(`events.category.${category}`),
        category,
        max_entries: parsed && !isNaN(parsed) ? parsed : null,
        age_min: ageMin,
        age_max: ageMax
      })
      setEvents((prev) => [...prev, event])
      setMaxEntries('')
      setAgeType(initAgeType)
      setAgeValue(initAgeValue)
      setName(buildAutoName(category, initAgeType, initAgeValue))
      setNameEdited(false)
      setShowForm(false)
      onEventsChange?.()
    } finally {
      setIsAdding(false)
    }
  }

  function handleDragStart(index: number) {
    dragIndexRef.current = index
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    setDragOverIndex(index)
  }

  function handleDrop(dropIndex: number) {
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverIndex(null)
      dragIndexRef.current = null
      return
    }
    const reordered = [...events]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    setEvents(reordered)
    setDragOverIndex(null)
    dragIndexRef.current = null
    api.events.reorder(reordered.map((e) => e.id))
  }

  function handleDragEnd() {
    setDragOverIndex(null)
    dragIndexRef.current = null
  }

  async function handleDelete(id: string) {
    const result = await api.events.delete(id)
    if (result && 'error' in result) {
      if (result.error === 'EVENT_HAS_ENTRIES') setDeleteError(t('events.deleteErrorEntries'))
      else if (result.error === 'EVENT_HAS_ROUNDS') setDeleteError(t('events.deleteErrorRounds'))
      else setDeleteError(t('events.deleteErrorGeneric'))
      return
    }
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setDeleteError(null)
    onEventsChange?.()
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('events.title')}</h2>
        <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t('events.add')}
        </Button>
      </div>

      {deleteError && (
        <p className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {deleteError}
        </p>
      )}

      {events.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">{t('events.empty')}</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {events.map((event, index) => (
            <li
              key={event.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                dragOverIndex === index ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/40 active:cursor-grabbing" />
                <span className="w-7 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                  {event.category}
                </span>
                {editingId === event.id ? (
                  <input
                    ref={editInputRef}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => commitEdit(event.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(event.id)
                      if (e.key === 'Escape') cancelEdit()
                    }}
                    className="rounded border border-input bg-transparent px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <span
                    className="cursor-text rounded px-1 hover:bg-muted"
                    onClick={() => startEditing(event)}
                    title="Click to edit"
                  >
                    {event.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {(event.age_min != null || event.age_max != null) && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {event.age_min != null && event.age_max == null
                      ? `${event.age_min}+`
                      : event.age_max != null && event.age_min == null
                        ? `U${event.age_max + 1}`
                        : `${event.age_min}–${event.age_max}`}
                  </span>
                )}
                {event.max_entries != null && (
                  <span className="text-xs text-muted-foreground">
                    max {event.max_entries}
                  </span>
                )}
                <button
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  title={t('events.goToEntries')}
                  onClick={() => navigate(`/tournaments/${tournamentId}/teams?event=${event.id}`)}
                >
                  {entryCounts[event.id] ?? 0} {t('events.entriesCount')}
                </button>
                <button
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  title={t('events.goToRounds')}
                  onClick={() => navigate(`/tournaments/${tournamentId}/rounds?event=${event.id}`)}
                >
                  {roundCounts[event.id] ?? 0} {t('events.roundsCount')}
                </button>
                {!entryCounts[event.id] && !roundCounts[event.id] && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(event.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="rounded-md border p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">{t('events.newCategory')}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowForm(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{t('events.fieldCategory')}</label>
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value as EventCategory)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {EVENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{t('events.fieldName')}</label>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setNameEdited(true)
                  }}
                  placeholder={category}
                  className="max-w-xs"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">{t('events.fieldMaxEntries')}</label>
                <Input
                  type="number"
                  min={1}
                  value={maxEntries}
                  onChange={(e) => setMaxEntries(e.target.value)}
                  placeholder={t('events.maxEntriesPlaceholder')}
                  className="w-32"
                />
              </div>
              <Button type="submit" variant="default" size="sm" disabled={isAdding}>
                {t('common.save')}
              </Button>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">{t('events.ageRestriction')}:</span>
              {(['none', 'under', 'over'] as const).map((type) => (
                <label key={type} className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    name="ageType"
                    value={type}
                    checked={ageType === type}
                    onChange={() => {
                      setAgeType(type)
                      setAgeValue('')
                      if (!nameEdited) setName(buildAutoName(category, type, ''))
                    }}
                    className="accent-primary"
                  />
                  {type === 'none' && t('events.ageNone')}
                  {type === 'under' && 'U…'}
                  {type === 'over' && '…+'}
                </label>
              ))}
              {ageType !== 'none' && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {ageType === 'under' && <span className="font-mono font-semibold">U</span>}
                  <Input
                    type="number"
                    min={1}
                    value={ageValue}
                    onChange={(e) => {
                      setAgeValue(e.target.value)
                      if (!nameEdited) setName(buildAutoName(category, ageType, e.target.value))
                    }}
                    placeholder={ageType === 'under' ? '19' : '45'}
                    className="h-7 w-16 text-xs"
                  />
                  {ageType === 'over' && <span className="font-mono font-semibold">+</span>}
                </div>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
