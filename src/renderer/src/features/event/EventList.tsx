import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
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
}

export function EventList({ tournamentId, defaultAgeMin, defaultAgeMax }: Props) {
  const { t } = useTranslation()
  const [events, setEvents] = useState<Event[]>([])
  const [category, setCategory] = useState<EventCategory>('MS')
  const [name, setName] = useState(t('events.category.MS'))
  const [maxEntries, setMaxEntries] = useState('')
  const [ageType, setAgeType] = useState<'none' | 'under' | 'over'>(() => {
    if (defaultAgeMin != null) return 'over'
    if (defaultAgeMax != null) return 'under'
    return 'none'
  })
  const [ageValue, setAgeValue] = useState(() => {
    if (defaultAgeMin != null) return String(defaultAgeMin)
    if (defaultAgeMax != null) return String(defaultAgeMax + 1)
    return ''
  })
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  function handleCategoryChange(cat: EventCategory) {
    setCategory(cat)
    setName(t(`events.category.${cat}`))
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
      setName(t(`events.category.${category}`))
      setMaxEntries('')
      setAgeType(defaultAgeMin != null ? 'over' : defaultAgeMax != null ? 'under' : 'none')
      setAgeValue(defaultAgeMin != null ? String(defaultAgeMin) : defaultAgeMax != null ? String(defaultAgeMax + 1) : '')
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDelete(id: string) {
    await api.events.delete(id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold">{t('events.title')}</h2>

      {events.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">{t('events.empty')}</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-3">
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(event.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-2">
        <div className="flex items-center gap-2">
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
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t(`events.category.${category}`)}
            className="max-w-xs"
          />
          <Input
            type="number"
            min={1}
            value={maxEntries}
            onChange={(e) => setMaxEntries(e.target.value)}
            placeholder={t('events.maxEntriesPlaceholder')}
            className="w-32"
          />
          <Button type="submit" variant="outline" size="sm" disabled={isAdding}>
            {t('events.add')}
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
                onChange={(e) => setAgeValue(e.target.value)}
                placeholder={ageType === 'under' ? '19' : '45'}
                className="h-7 w-16 text-xs"
              />
              {ageType === 'over' && <span className="font-mono font-semibold">+</span>}
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
