import { useEffect, useState, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { useTranslation } from 'react-i18next'
import type { Court } from '@shared/types/ipc'

interface Props {
  tournamentId: string
}

export function CourtList({ tournamentId }: Props) {
  const { t } = useTranslation()
  const [courts, setCourts] = useState<Court[]>([])
  const [newName, setNewName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.courts.listByTournament(tournamentId).then(setCourts)
  }, [tournamentId])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setIsAdding(true)
    try {
      const court = await api.courts.create({ tournament_id: tournamentId, name })
      setCourts((prev) => [...prev, court])
      setNewName('')
      inputRef.current?.focus()
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDelete(id: string) {
    await api.courts.delete(id)
    setCourts((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold">{t('courts.title')}</h2>

      {courts.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">{t('courts.empty')}</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {courts.map((court) => (
            <li
              key={court.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span>{court.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(court.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          ref={inputRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('courts.namePlaceholder')}
          className="max-w-xs"
        />
        <Button type="submit" variant="outline" size="sm" disabled={isAdding || !newName.trim()}>
          {t('courts.add')}
        </Button>
      </form>
    </div>
  )
}
