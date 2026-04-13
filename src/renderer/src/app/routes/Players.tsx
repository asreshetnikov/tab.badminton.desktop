import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { useTranslation } from 'react-i18next'
import type { Player } from '@shared/types/ipc'

interface EditState {
  first_name: string
  last_name: string
  club: string
}

function emptyEdit(): EditState {
  return { first_name: '', last_name: '', club: '' }
}

export function Players() {
  const { t } = useTranslation()
  const [players, setPlayers] = useState<Player[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // inline add form
  const [adding, setAdding] = useState(false)
  const [newPlayer, setNewPlayer] = useState<EditState>(emptyEdit())
  const [isSavingNew, setIsSavingNew] = useState(false)

  // inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>(emptyEdit())

  useEffect(() => {
    api.players.list().then((list) => {
      setPlayers(list)
      setIsLoading(false)
    })
  }, [])

  // ── Add ──────────────────────────────────────────────────────────────────

  function startAdding() {
    setAdding(true)
    setNewPlayer(emptyEdit())
  }

  function cancelAdding() {
    setAdding(false)
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault()
    const first = newPlayer.first_name.trim()
    const last = newPlayer.last_name.trim()
    if (!first || !last) return
    setIsSavingNew(true)
    try {
      const player = await api.players.create({
        first_name: first,
        last_name: last,
        club: newPlayer.club.trim() || null
      })
      setPlayers((prev) => [...prev, player])
      setNewPlayer(emptyEdit())
      // keep the form open for fast batch entry
    } finally {
      setIsSavingNew(false)
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────

  function startEditing(player: Player) {
    setEditingId(player.id)
    setEditState({
      first_name: player.first_name,
      last_name: player.last_name,
      club: player.club ?? ''
    })
  }

  function cancelEditing() {
    setEditingId(null)
  }

  async function submitEdit(id: string) {
    const first = editState.first_name.trim()
    const last = editState.last_name.trim()
    if (!first || !last) return
    const updated = await api.players.update(id, {
      first_name: first,
      last_name: last,
      club: editState.club.trim() || null
    })
    setPlayers((prev) => prev.map((p) => (p.id === id ? updated : p)))
    setEditingId(null)
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete(player: Player) {
    const name = `${player.first_name} ${player.last_name}`
    if (!confirm(t('players.deleteDescription', { name }))) return
    await api.players.delete(player.id)
    setPlayers((prev) => prev.filter((p) => p.id !== player.id))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('players.title')}</h1>
        {!adding && (
          <Button onClick={startAdding}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('players.newPlayer')}
          </Button>
        )}
      </div>

      {players.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <p className="font-medium">{t('players.empty.title')}</p>
          <p className="text-sm text-muted-foreground">{t('players.empty.description')}</p>
          <Button onClick={startAdding}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('players.newPlayer')}
          </Button>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">{t('players.lastName')}</th>
              <th className="pb-2 pr-4 font-medium">{t('players.firstName')}</th>
              <th className="pb-2 pr-4 font-medium">{t('players.club')}</th>
              <th className="pb-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {players.map((player) =>
              editingId === player.id ? (
                <tr key={player.id} className="border-b">
                  <td className="py-1.5 pr-2">
                    <Input
                      value={editState.last_name}
                      onChange={(e) => setEditState((s) => ({ ...s, last_name: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(player.id); if (e.key === 'Escape') cancelEditing() }}
                      autoFocus
                      className="h-7 text-sm"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      value={editState.first_name}
                      onChange={(e) => setEditState((s) => ({ ...s, first_name: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(player.id); if (e.key === 'Escape') cancelEditing() }}
                      className="h-7 text-sm"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input
                      value={editState.club}
                      onChange={(e) => setEditState((s) => ({ ...s, club: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitEdit(player.id); if (e.key === 'Escape') cancelEditing() }}
                      placeholder={t('players.clubPlaceholder')}
                      className="h-7 text-sm"
                    />
                  </td>
                  <td className="py-1.5">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => submitEdit(player.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEditing}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={player.id} className="group border-b">
                  <td className="py-2 pr-4">{player.last_name}</td>
                  <td className="py-2 pr-4">{player.first_name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{player.club ?? '—'}</td>
                  <td className="py-2">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditing(player)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => handleDelete(player)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            )}

            {adding && (
              <tr className="border-b">
                <td className="py-1.5 pr-2">
                  <Input
                    value={newPlayer.last_name}
                    onChange={(e) => setNewPlayer((s) => ({ ...s, last_name: e.target.value }))}
                    placeholder={t('players.lastName')}
                    autoFocus
                    className="h-7 text-sm"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <Input
                    value={newPlayer.first_name}
                    onChange={(e) => setNewPlayer((s) => ({ ...s, first_name: e.target.value }))}
                    placeholder={t('players.firstName')}
                    className="h-7 text-sm"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <Input
                    value={newPlayer.club}
                    onChange={(e) => setNewPlayer((s) => ({ ...s, club: e.target.value }))}
                    placeholder={t('players.clubPlaceholder')}
                    className="h-7 text-sm"
                  />
                </td>
                <td className="py-1.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isSavingNew} onClick={submitNew}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelAdding}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
