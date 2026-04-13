import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, UserPlus } from 'lucide-react'
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
import type { Tournament, Player, TournamentPlayerWithPlayer, RegistrationStatus } from '@shared/types/ipc'

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
  const [isLoading, setIsLoading] = useState(true)

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
      api.players.list()
    ]).then(([t, regs, players]) => {
      setTournament(t)
      setRegistrations(regs)
      setAllPlayers(players)
      setIsLoading(false)
    })
  }, [id])

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
              {registrations.length} registered
            </span>
          )}
          {availablePlayers.length > 0 && (
            <Button onClick={openDialog}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              {t('registrations.add')}
            </Button>
          )}
        </div>
      </div>

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
              <th className="pb-2 pr-4 font-medium">{t('players.lastName')}</th>
              <th className="pb-2 pr-4 font-medium">{t('players.firstName')}</th>
              <th className="pb-2 pr-4 font-medium">{t('players.club')}</th>
              <th className="pb-2 pr-4 font-medium">{t('registrations.registeredAt')}</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {registrations.map((reg) => (
              <tr key={reg.id} className="group border-b">
                <td className="py-2 pr-4">{reg.player.last_name}</td>
                <td className="py-2 pr-4">{reg.player.first_name}</td>
                <td className="py-2 pr-4 text-muted-foreground">{reg.player.club ?? '—'}</td>
                <td className="py-2 pr-4 text-muted-foreground">{formatDate(reg.registered_at)}</td>
                <td className="py-2 pr-4">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusStyle[reg.status])}>
                    {t(`registrations.status.${reg.status}`)}
                  </span>
                </td>
                <td className="py-2">
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
