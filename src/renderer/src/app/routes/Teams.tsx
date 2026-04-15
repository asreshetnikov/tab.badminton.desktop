import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { useTranslation } from 'react-i18next'
import { EVENT_CATEGORIES } from '@shared/types/event'
import { cn } from '@renderer/lib/utils'
import { statusClass } from '@renderer/features/tournament/status'
import type { TeamWithPlayers, EventCategory, Player } from '@shared/types/ipc'

const DOUBLES: EventCategory[] = ['MD', 'WD', 'XD']
const isDoubles = (cat: EventCategory) => DOUBLES.includes(cat)

function categoryBadge(cat: EventCategory) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusClass[cat] ?? 'bg-muted text-muted-foreground')}>
      {cat}
    </span>
  )
}

export function Teams() {
  const { t } = useTranslation()
  const [teams, setTeams] = useState<TeamWithPlayers[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<EventCategory | null>(null)

  const [category, setCategory] = useState<EventCategory>('MS')
  const [player1Id, setPlayer1Id] = useState('')
  const [player2Id, setPlayer2Id] = useState('')
  const [name, setName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  function startEditingName(team: TeamWithPlayers) {
    setEditingId(team.id)
    setEditingName(team.name)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  async function commitNameEdit(id: string) {
    const trimmed = editingName.trim()
    if (!trimmed) { cancelNameEdit(); return }
    const updated = await api.teams.update(id, { name: trimmed })
    setTeams((prev) => prev.map((t) => (t.id === id ? updated : t)))
    setEditingId(null)
  }

  function cancelNameEdit() {
    setEditingId(null)
    setEditingName('')
  }

  useEffect(() => {
    Promise.all([api.teams.list(), api.players.list()]).then(([t, p]) => {
      setTeams(t)
      setPlayers(p)
      setIsLoading(false)
    })
  }, [])

  // Auto-generate name from selected players
  useEffect(() => {
    const p1 = players.find((p) => p.id === player1Id)
    const p2 = players.find((p) => p.id === player2Id)
    if (isDoubles(category) && p1 && p2) {
      setName(`${p1.last_name} / ${p2.last_name}`)
    } else if (p1) {
      setName(p1.last_name)
    } else {
      setName('')
    }
  }, [player1Id, player2Id, category, players])

  const displayTeams = useMemo(() => {
    let result = teams
    if (catFilter) result = result.filter((team) => team.category === catFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (team) =>
          team.name.toLowerCase().includes(q) ||
          team.players.some((p) => p.last_name.toLowerCase().includes(q))
      )
    }
    return result
  }, [teams, search, catFilter])

  function startAdding() {
    setAdding(true)
    setCategory('MS')
    setPlayer1Id('')
    setPlayer2Id('')
    setName('')
  }

  function cancelAdding() {
    setAdding(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!player1Id) return
    if (isDoubles(category) && !player2Id) return
    setIsSaving(true)
    try {
      const player_ids: [string] | [string, string] = isDoubles(category)
        ? [player1Id, player2Id]
        : [player1Id]
      const team = await api.teams.create({
        name: name.trim() || player1Id,
        category,
        player_ids
      })
      setTeams((prev) => [...prev, team])
      setAdding(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(team: TeamWithPlayers) {
    if (!confirm(t('teams.deleteDescription', { name: team.name }))) return
    await api.teams.delete(team.id)
    setTeams((prev) => prev.filter((t) => t.id !== team.id))
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  const playerOptions = (exclude?: string) =>
    players.filter((p) => p.id !== exclude)

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('teams.title')}</h1>
        {!adding && (
          <Button onClick={startAdding}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('teams.newTeam')}
          </Button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleSubmit} className="mb-8 max-w-xl rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">{t('teams.newTeam')}</h2>

          {/* Row 1: category + players */}
          <div className="grid grid-cols-[160px_1fr] gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('teams.category')}</label>
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value as EventCategory); setPlayer1Id(''); setPlayer2Id('') }}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {EVENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} — {t(`events.category.${cat}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className={cn('grid gap-3', isDoubles(category) ? 'grid-cols-2' : 'grid-cols-1')}>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {isDoubles(category) ? t('teams.playerOne') : t('teams.player')}
                </label>
                <select
                  value={player1Id}
                  onChange={(e) => setPlayer1Id(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">{t('teams.selectPlayer')}</option>
                  {playerOptions(player2Id).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.last_name} {p.first_name}{p.club ? ` (${p.club})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {isDoubles(category) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('teams.playerTwo')}</label>
                  <select
                    value={player2Id}
                    onChange={(e) => setPlayer2Id(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">{t('teams.selectPlayer')}</option>
                    {playerOptions(player1Id).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.last_name} {p.first_name}{p.club ? ` (${p.club})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: team name */}
          <div className="mt-4 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('tournamentForm.name')}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Row 3: actions */}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancelAdding}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || !player1Id || (isDoubles(category) && !player2Id)}
            >
              {t('common.create')}
            </Button>
          </div>
        </form>
      )}

      {teams.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('teams.searchPlaceholder')}
            className="h-9 max-w-xs rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setCatFilter(null)}
              className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${catFilter === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              {t('teams.allCategories')}
            </button>
            {EVENT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCatFilter(catFilter === cat ? null : cat)}
                className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${catFilter === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {teams.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <p className="font-medium">{t('teams.empty.title')}</p>
          <p className="text-sm text-muted-foreground">{t('teams.empty.description')}</p>
          <Button onClick={startAdding}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('teams.newTeam')}
          </Button>
        </div>
      ) : (
        <table className="w-full text-sm">
          <colgroup>
            <col className="w-16" />
            <col />
            <col />
            <col className="w-20" />
          </colgroup>
          <thead>
            <tr className="border-b text-left text-xs font-medium text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">{t('teams.category')}</th>
              <th className="pb-2 pr-4 font-medium">{t('tournamentForm.name')}</th>
              <th className="pb-2 pr-4 font-medium">{t('players.club')}</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {displayTeams.map((team) => (
              <tr key={team.id} className="group border-b">
                <td className="py-2 pr-4">{categoryBadge(team.category)}</td>
                <td className="py-2 pr-4 font-medium">
                  {editingId === team.id ? (
                    <input
                      ref={editInputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => commitNameEdit(team.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitNameEdit(team.id)
                        if (e.key === 'Escape') cancelNameEdit()
                      }}
                      className="rounded border border-input bg-transparent px-1.5 py-0.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  ) : (
                    <span
                      className="cursor-text rounded px-1 hover:bg-muted"
                      onClick={() => startEditingName(team)}
                      title="Click to rename"
                    >
                      {team.name}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {team.players.map((p) => `${p.last_name} ${p.first_name}${p.club ? ` (${p.club})` : ''}`).join(' / ')}
                </td>
                <td className="py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 hover:text-destructive group-hover:opacity-100"
                    onClick={() => handleDelete(team)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
