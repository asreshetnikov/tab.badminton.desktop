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
    await onSubmit({
      name: name.trim(),
      venue_id: venueId,
      date_start: dateStart,
      date_end: dateEnd
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
