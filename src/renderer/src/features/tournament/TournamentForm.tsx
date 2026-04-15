import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { VenueSelect } from '@renderer/features/venue/VenueSelect'
import type { CreateTournamentDTO } from '@shared/types/ipc'

interface Props {
  defaultValues?: Partial<CreateTournamentDTO>
  submitLabel: string
  isSubmitting?: boolean
  onSubmit: (data: CreateTournamentDTO) => Promise<void>
  onCancel: () => void
}

interface FormErrors {
  name?: string
  date_start?: string
  date_end?: string
}

export function TournamentForm({
  defaultValues,
  submitLabel,
  isSubmitting = false,
  onSubmit,
  onCancel
}: Props) {
  const { t } = useTranslation()
  const [name, setName] = useState(defaultValues?.name ?? '')
  const [venueId, setVenueId] = useState<string | null>(defaultValues?.venue_id ?? null)
  const [dateStart, setDateStart] = useState(defaultValues?.date_start ?? '')
  const [dateEnd, setDateEnd] = useState(defaultValues?.date_end ?? '')
  const [ageType, setAgeType] = useState<'none' | 'under' | 'over'>(() => {
    if (defaultValues?.age_min != null) return 'over'
    if (defaultValues?.age_max != null) return 'under'
    return 'none'
  })
  const [ageValue, setAgeValue] = useState(() => {
    if (defaultValues?.age_min != null) return String(defaultValues.age_min)
    if (defaultValues?.age_max != null) return String(defaultValues.age_max + 1)
    return ''
  })
  const [errors, setErrors] = useState<FormErrors>({})

  function validate(): boolean {
    const next: FormErrors = {}
    if (!name.trim()) next.name = t('validation.required')
    if (!dateStart) next.date_start = t('validation.required')
    if (!dateEnd) next.date_end = t('validation.required')
    if (dateStart && dateEnd && dateEnd < dateStart)
      next.date_end = t('validation.dateRange')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const parsedAgeVal = ageValue.trim() ? parseInt(ageValue, 10) : null
    await onSubmit({
      name: name.trim(),
      venue_id: venueId,
      date_start: dateStart,
      date_end: dateEnd,
      age_min: ageType === 'over' && parsedAgeVal ? parsedAgeVal : null,
      age_max: ageType === 'under' && parsedAgeVal ? parsedAgeVal - 1 : null
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('tournamentForm.name')}</label>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })) }}
          placeholder={t('tournamentForm.namePlaceholder')}
          autoFocus
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('tournamentForm.venue')}</label>
        <VenueSelect value={venueId} onChange={setVenueId} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('tournamentForm.dateStart')}</label>
          <Input
            type="date"
            value={dateStart}
            onChange={(e) => { setDateStart(e.target.value); setErrors((p) => ({ ...p, date_start: undefined })) }}
          />
          {errors.date_start && <p className="text-xs text-destructive">{errors.date_start}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('tournamentForm.dateEnd')}</label>
          <Input
            type="date"
            value={dateEnd}
            onChange={(e) => { setDateEnd(e.target.value); setErrors((p) => ({ ...p, date_end: undefined })) }}
          />
          {errors.date_end && <p className="text-xs text-destructive">{errors.date_end}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t('events.ageRestriction')}</label>
        <div className="flex items-center gap-4">
          {(['none', 'under', 'over'] as const).map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="tournamentAgeType"
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
            <div className="flex items-center gap-1 text-sm">
              {ageType === 'under' && <span className="font-mono font-semibold">U</span>}
              <input
                type="number"
                min={1}
                value={ageValue}
                onChange={(e) => setAgeValue(e.target.value)}
                placeholder={ageType === 'under' ? '19' : '45'}
                className="h-9 w-20 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {ageType === 'over' && <span className="font-mono font-semibold">+</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
