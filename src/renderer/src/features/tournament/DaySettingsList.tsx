import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { DEFAULT_START_TIME, DEFAULT_MATCH_DURATION } from '@shared/types/tournament-day-settings'
import type { TournamentDaySetting } from '@shared/types/ipc'

interface Props {
  tournamentId: string
  dateStart: string  // YYYY-MM-DD
  dateEnd: string    // YYYY-MM-DD
}

function getDaysInRange(start: string, end: string): string[] {
  const days: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  const pad = (n: number) => String(n).padStart(2, '0')
  while (cur <= last) {
    days.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`)
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function formatDayLabel(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

export function DaySettingsList({ tournamentId, dateStart, dateEnd }: Props) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<TournamentDaySetting[]>([])
  const days = getDaysInRange(dateStart, dateEnd)

  useEffect(() => {
    api.tournamentDaySettings.listByTournament(tournamentId).then(setSettings)
  }, [tournamentId])

  function getSetting(date: string): TournamentDaySetting | undefined {
    return settings.find((s) => s.date === date)
  }

  async function handleChange(date: string, field: 'start_time' | 'match_duration', value: string) {
    const current = getSetting(date)
    const dto = {
      start_time: current?.start_time ?? DEFAULT_START_TIME,
      match_duration: current?.match_duration ?? DEFAULT_MATCH_DURATION,
      [field]: field === 'match_duration' ? (parseInt(value) || DEFAULT_MATCH_DURATION) : value
    }
    const updated = await api.tournamentDaySettings.upsert(tournamentId, date, dto)
    setSettings((prev) => {
      const exists = prev.find((s) => s.date === date)
      return exists
        ? prev.map((s) => (s.date === date ? updated : s))
        : [...prev, updated]
    })
  }

  async function handleReset(date: string) {
    const s = getSetting(date)
    if (!s) return
    await api.tournamentDaySettings.delete(s.id)
    setSettings((prev) => prev.filter((x) => x.date !== date))
  }

  const hasRecord = (date: string) => settings.some((s) => s.date === date)

  async function handleAccept(date: string) {
    const dto = { start_time: DEFAULT_START_TIME, match_duration: DEFAULT_MATCH_DURATION }
    const updated = await api.tournamentDaySettings.upsert(tournamentId, date, dto)
    setSettings((prev) => [...prev, updated])
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold">{t('daySettings.title')}</h2>
      <div className="space-y-1">
        <div className="grid grid-cols-[160px_100px_120px_60px] gap-x-4 pb-1 text-xs font-medium text-muted-foreground">
          <span></span>
          <span>{t('daySettings.startTime')}</span>
          <span>{t('daySettings.matchDuration')}</span>
          <span></span>
        </div>
        {days.map((date) => {
          const s = getSetting(date)
          const startTime = s?.start_time ?? DEFAULT_START_TIME
          const duration = s?.match_duration ?? DEFAULT_MATCH_DURATION
          const saved = hasRecord(date)
          return (
            <div key={date} className="grid grid-cols-[160px_100px_120px_auto] items-center gap-x-4 rounded-md px-1 py-1 hover:bg-muted/40">
              <span className={`text-sm ${saved ? 'font-medium' : 'text-muted-foreground'}`}>
                {formatDayLabel(date)}
              </span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => handleChange(date, 'start_time', e.target.value)}
                className={`h-7 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${!saved ? 'text-muted-foreground' : ''}`}
              />
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => handleChange(date, 'match_duration', e.target.value)}
                className={`h-7 w-20 rounded border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${!saved ? 'text-muted-foreground' : ''}`}
              />
              {saved ? (
                <button
                  type="button"
                  onClick={() => handleReset(date)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  {t('daySettings.reset')}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs italic text-muted-foreground/50">Default</span>
                  <button
                    type="button"
                    onClick={() => handleAccept(date)}
                    className="flex items-center gap-1 rounded border border-input px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                  >
                    <Check className="h-3 w-3" />
                    Accept
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
