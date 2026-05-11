import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, CalendarClock } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import type { Tournament, PlayerActivityStatus, EventCategory } from '@shared/types/ipc'

const CATEGORY_ORDER: EventCategory[] = ['MS', 'WS', 'MD', 'WD', 'XD']

const CATEGORY_STYLE: Record<EventCategory, string> = {
  MS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  WS: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  MD: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  WD: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  XD: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
}

const GENDER_STYLE: Record<string, string> = {
  M: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  F: 'bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400',
}

function CategoryBadge({ category, dimmed }: { category: EventCategory; dimmed?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block rounded px-1.5 py-0.5 text-xs font-medium',
        dimmed ? 'bg-muted text-muted-foreground' : CATEGORY_STYLE[category]
      )}
    >
      {category}
    </span>
  )
}

export function TournamentActivity() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [tournament, setTournament] = useState<Tournament | undefined>()
  const [players, setPlayers] = useState<PlayerActivityStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [enabledCategories, setEnabledCategories] = useState<Set<EventCategory>>(new Set())

  useEffect(() => {
    if (!id) return
    Promise.all([api.tournament.getById(id), api.tournamentPlayers.getPlayerActivity(id)]).then(
      ([t, activity]) => {
        setTournament(t)
        setPlayers(activity)
        const all = new Set<EventCategory>()
        for (const p of activity) {
          for (const c of p.activeCategories) all.add(c)
          for (const c of p.doneCategories) all.add(c)
        }
        setEnabledCategories(all)
        setIsLoading(false)
      }
    )
  }, [id])

  const allCategories = useMemo(() => {
    const cats = new Set<EventCategory>()
    for (const p of players) {
      for (const c of p.activeCategories) cats.add(c)
      for (const c of p.doneCategories) cats.add(c)
    }
    return CATEGORY_ORDER.filter((c) => cats.has(c))
  }, [players])

  function toggleCategory(cat: EventCategory) {
    setEnabledCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const { activePlayers, eliminatedPlayers } = useMemo(() => {
    const filtered = players.map((p) => ({
      ...p,
      activeCategories: p.activeCategories.filter((c) => enabledCategories.has(c)),
      doneCategories: p.doneCategories.filter((c) => enabledCategories.has(c)),
    }))
    const activePlayers = filtered
      .filter((p) => p.activeCategories.length > 0)
      .sort((a, b) => b.activeCategories.length - a.activeCategories.length)
    const eliminatedPlayers = filtered.filter((p) => p.activeCategories.length === 0)
    return { activePlayers, eliminatedPlayers }
  }, [players, enabledCategories])

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('dashboard.loading')}</div>
  }

  function renderRow(player: PlayerActivityStatus) {
    return (
      <tr
        key={player.playerId}
        className="border-b last:border-0 hover:bg-muted/40 transition-colors"
      >
        <td className="px-4 py-2.5 text-sm font-medium">
          {player.lastName} {player.firstName}
        </td>
        <td className="px-4 py-2.5 text-sm text-muted-foreground">{player.club ?? '—'}</td>
        <td className="px-4 py-2.5">
          {player.gender && (
            <span
              className={cn(
                'inline-block rounded px-1.5 py-0.5 text-xs font-medium',
                GENDER_STYLE[player.gender]
              )}
            >
              {player.gender}
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-center text-sm font-semibold tabular-nums">
          {player.activeCategories.length > 0 ? player.activeCategories.length : null}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex flex-wrap gap-1">
            {player.activeCategories.map((cat) => (
              <CategoryBadge key={cat} category={cat} />
            ))}
          </div>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex flex-wrap gap-1">
            {player.doneCategories.map((cat) => (
              <CategoryBadge key={cat} category={cat} dimmed />
            ))}
          </div>
        </td>
      </tr>
    )
  }

  function renderSection(title: string, list: PlayerActivityStatus[], count: number) {
    return (
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {count}
          </span>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">{t('players.lastName') ?? 'Name'}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('players.club')}</th>
                  <th className="px-4 py-2 text-left font-medium"></th>
                  <th className="px-4 py-2 text-center font-medium">#</th>
                  <th className="px-4 py-2 text-left font-medium">{t('activity.active')}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('activity.done')}</th>
                </tr>
              </thead>
              <tbody>{list.map(renderRow)}</tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/tournaments/${id}`)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{t('activity.title')}</h1>
          {tournament && (
            <p className="text-sm text-muted-foreground">{tournament.name}</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {t('activity.summary', { active: activePlayers.length, total: players.length })}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigate(`/tournaments/${id}/schedule`)}>
            <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
            {t('schedule.title')}
          </Button>
        </div>
      </div>

      {players.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('activity.noPlayers')}</p>
      ) : (
        <>
          {allCategories.length > 1 && (
            <div className="mb-5 flex flex-wrap items-center gap-3">
              {allCategories.map((cat) => (
                <label key={cat} className="flex cursor-pointer items-center gap-1.5 select-none">
                  <input
                    type="checkbox"
                    checked={enabledCategories.has(cat)}
                    onChange={() => toggleCategory(cat)}
                    className="h-3.5 w-3.5 rounded accent-foreground"
                  />
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs font-medium transition-opacity',
                      enabledCategories.has(cat) ? CATEGORY_STYLE[cat] : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {cat}
                  </span>
                </label>
              ))}
            </div>
          )}
          {renderSection(t('activity.stillPlaying'), activePlayers, activePlayers.length)}
          {renderSection(t('activity.eliminated'), eliminatedPlayers, eliminatedPlayers.length)}
        </>
      )}
    </div>
  )
}
