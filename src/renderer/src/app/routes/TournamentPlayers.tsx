import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, UserPlus, ChevronUp, ChevronDown } from 'lucide-react'
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
import { formatDate } from '@renderer/lib/format'
import type { Tournament, Player, TournamentPlayerWithPlayer, RegistrationStatus, TournamentTeamWithTeam, EventCategory } from '@shared/types/ipc'

type SortKey = 'lastName' | 'firstName' | 'club' | 'registeredAt' | 'status'
type SortDir = 'asc' | 'desc'

const CATEGORY_STYLE: Record<EventCategory, string> = {
  MS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  WS: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  MD: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  WD: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  XD: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
}

const statusStyle: Record<RegistrationStatus, string> = {
  pending:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  accepted: 'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-400',
  rejected: 'bg-red-100    text-red-800    dark:bg-red-900/30    dark:text-red-400'
}

export function TournamentPlayers() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [tournament, setTournament] = useState<Tournament | undefined>()
  const [registrations, setRegistrations] = useState<TournamentPlayerWithPlayer[]>([])
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeamWithTeam[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // registrations list filter & sort
  const [regSearch, setRegSearch] = useState('')
  const [regGenderFilter, setRegGenderFilter] = useState<'M' | 'F' | null>(null)
  const [regStatusFilter, setRegStatusFilter] = useState<RegistrationStatus | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('lastName')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // bulk-add dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.tournament.getById(id),
      api.tournamentPlayers.listByTournament(id),
      api.players.list(),
      api.tournamentTeams.listByTournament(id),
    ]).then(([t, regs, players, teams]) => {
      setTournament(t)
      setRegistrations(regs)
      setAllPlayers(players)
      setTournamentTeams(teams)
      setIsLoading(false)
    })
  }, [id])

  const displayRegistrations = useMemo(() => {
    let result = registrations
    if (regGenderFilter) result = result.filter((r) => r.player.gender === regGenderFilter)
    if (regStatusFilter) result = result.filter((r) => r.status === regStatusFilter)
    if (regSearch.trim()) {
      const q = regSearch.toLowerCase()
      result = result.filter(
        (r) =>
          r.player.last_name.toLowerCase().includes(q) ||
          r.player.first_name.toLowerCase().includes(q) ||
          (r.player.club ?? '').toLowerCase().includes(q) ||
          (r.player.birth_year != null && String(r.player.birth_year).includes(q))
      )
    }
    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'lastName':
          cmp = a.player.last_name.localeCompare(b.player.last_name) ||
                a.player.first_name.localeCompare(b.player.first_name)
          break
        case 'firstName':
          cmp = a.player.first_name.localeCompare(b.player.first_name) ||
                a.player.last_name.localeCompare(b.player.last_name)
          break
        case 'club':
          cmp = (a.player.club ?? '').localeCompare(b.player.club ?? '')
          break
        case 'registeredAt':
          cmp = a.registered_at.localeCompare(b.registered_at)
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [registrations, regSearch, regGenderFilter, regStatusFilter, sortKey, sortDir])

  // player_id → sorted list of categories they're entered in
  const categoriesByPlayer = useMemo(() => {
    const ORDER: EventCategory[] = ['MS', 'WS', 'MD', 'WD', 'XD']
    const map = new Map<string, EventCategory[]>()
    for (const tt of tournamentTeams) {
      for (const p of tt.team.players) {
        if (!map.has(p.id)) map.set(p.id, [])
        const cats = map.get(p.id)!
        cats.push(tt.team.category)
      }
    }
    map.forEach((cats) => cats.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)))
    return map
  }, [tournamentTeams])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const registeredIds = useMemo(
    () => new Set(registrations.map((r) => r.player_id)),
    [registrations]
  )

  const availablePlayers = useMemo(
    () => allPlayers.filter((p) => !registeredIds.has(p.id)),
    [allPlayers, registeredIds]
  )

  const filteredPlayers = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return availablePlayers
    return availablePlayers.filter(
      (p) =>
        p.last_name.toLowerCase().includes(q) ||
        p.first_name.toLowerCase().includes(q) ||
        (p.club ?? '').toLowerCase().includes(q)
    )
  }, [availablePlayers, search])

  const allFilteredSelected =
    filteredPlayers.length > 0 && filteredPlayers.every((p) => selected.has(p.id))

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredPlayers.forEach((p) => next.delete(p.id))
      } else {
        filteredPlayers.forEach((p) => next.add(p.id))
      }
      return next
    })
  }

  function toggle(playerId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
  }

  function openDialog() {
    setSearch('')
    setSelected(new Set())
    setDialogOpen(true)
  }

  async function handleRegister() {
    if (!id || selected.size === 0) return
    setIsSaving(true)
    try {
      const newRegs = await api.tournamentPlayers.registerMany(id, [...selected])
      setRegistrations((prev) => [...prev, ...newRegs])
      setDialogOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleStatusChange(regId: string, status: RegistrationStatus) {
    const updated = await api.tournamentPlayers.updateStatus(regId, status)
    setRegistrations((prev) => prev.map((r) => (r.id === regId ? updated : r)))
  }

  async function handleAcceptAll() {
    const pending = registrations.filter((r) => r.status === 'pending')
    const updated = await Promise.all(pending.map((r) => api.tournamentPlayers.updateStatus(r.id, 'accepted')))
    setRegistrations((prev) => {
      const map = new Map(updated.map((u) => [u.id, u]))
      return prev.map((r) => map.get(r.id) ?? r)
    })
  }

  async function handleRemove(regId: string) {
    await api.tournamentPlayers.remove(regId)
    setRegistrations((prev) => prev.filter((r) => r.id !== regId))
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
          <h1 className="text-xl font-semibold">{t('registrations.title')}</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {registrations.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {displayRegistrations.length} {t('players.title').toLowerCase()}
            </span>
          )}
          {registrations.some((r) => r.status === 'pending') && (
            <Button variant="outline" onClick={handleAcceptAll}>
              {t('registrations.acceptAll')}
            </Button>
          )}
          {availablePlayers.length > 0 && (
            <Button onClick={openDialog}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              {t('registrations.add')}
            </Button>
          )}
        </div>
      </div>

      {/* Search & filter */}
      {registrations.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            value={regSearch}
            onChange={(e) => setRegSearch(e.target.value)}
            placeholder={t('players.searchPlaceholder')}
            className="max-w-sm"
          />
          <div className="flex gap-1">
            {([null, 'M', 'F'] as const).map((g) => (
              <button
                key={g ?? 'all'}
                type="button"
                onClick={() => setRegGenderFilter(g)}
                className={`h-9 rounded px-3 text-sm font-medium transition-colors ${
                  regGenderFilter === g
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {g === null ? t('teams.allCategories') : g === 'F' ? 'W' : g}
              </button>
            ))}
          </div>
          <select
            value={regStatusFilter ?? ''}
            onChange={(e) => setRegStatusFilter((e.target.value as RegistrationStatus) || null)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">{t('teams.allCategories')}</option>
            {(['pending', 'accepted', 'rejected'] as const).map((s) => (
              <option key={s} value={s}>{t(`registrations.status.${s}`)}</option>
            ))}
          </select>
        </div>
      )}

      {/* Empty state */}
      {registrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <p className="font-medium">{t('registrations.empty.title')}</p>
          <p className="text-sm text-muted-foreground">{t('registrations.empty.description')}</p>
          {availablePlayers.length > 0 && (
            <Button onClick={openDialog}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              {t('registrations.add')}
            </Button>
          )}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium text-muted-foreground">
              {(
                [
                  ['lastName',  t('players.lastName')],
                  ['firstName', t('players.firstName')],
                  ['club',      t('players.club')],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th key={key} className="pb-2 pr-4 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort(key)}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    {label}
                    {sortKey === key ? (
                      sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    ) : (
                      <span className="h-3 w-3" />
                    )}
                  </button>
                </th>
              ))}
              <th className="pb-2 pr-4" />
              {(
                [
                  ['registeredAt', t('registrations.registeredAt')],
                  ['status',       'Status'],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th key={key} className="pb-2 pr-4 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort(key)}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    {label}
                    {sortKey === key ? (
                      sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    ) : (
                      <span className="h-3 w-3" />
                    )}
                  </button>
                </th>
              ))}
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {displayRegistrations.map((reg) => (
              <tr
                key={reg.id}
                className="group cursor-pointer border-b hover:bg-muted/40"
                onClick={() => navigate(`/tournaments/${id}/players/${reg.player_id}`)}
              >
                <td className="py-2 pr-4">{reg.player.last_name}</td>
                <td className="py-2 pr-4">{reg.player.first_name}</td>
                <td className="py-2 pr-4 text-muted-foreground">{reg.player.club ?? '—'}</td>
                <td className="py-2 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {(categoriesByPlayer.get(reg.player_id) ?? []).map((cat) => (
                      <span
                        key={cat}
                        className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', CATEGORY_STYLE[cat])}
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-2 pr-4 text-muted-foreground">{formatDate(reg.registered_at)}</td>
                <td className="py-2 pr-4">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusStyle[reg.status])}>
                    {t(`registrations.status.${reg.status}`)}
                  </span>
                </td>
                <td className="py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    {reg.status !== 'accepted' && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-green-700 hover:text-green-800"
                        onClick={() => handleStatusChange(reg.id, 'accepted')}>
                        {t('registrations.accept')}
                      </Button>
                    )}
                    {reg.status !== 'rejected' && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700"
                        onClick={() => handleStatusChange(reg.id, 'rejected')}>
                        {t('registrations.reject')}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(reg.id)}>
                      {t('registrations.remove')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Bulk-add dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('registrations.addDialogTitle')}</DialogTitle>
          </DialogHeader>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('registrations.search')}
            autoFocus
          />

          {/* Select all row */}
          {filteredPlayers.length > 0 && (
            <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm font-medium">{t('registrations.selectAll')}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {filteredPlayers.length} players
              </span>
            </label>
          )}

          {/* Player list */}
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {filteredPlayers.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">No players found.</p>
            ) : (
              <ul>
                {filteredPlayers.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <span className="flex-1 text-sm">
                        {p.last_name} {p.first_name}
                      </span>
                      {p.club && (
                        <span className="text-xs text-muted-foreground">{p.club}</span>
                      )}
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
            <Button
              disabled={selected.size === 0 || isSaving}
              onClick={handleRegister}
            >
              {t('registrations.registerSelected', { count: selected.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
