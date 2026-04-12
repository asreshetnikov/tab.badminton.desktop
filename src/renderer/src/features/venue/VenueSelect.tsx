import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { useVenueStore } from '@renderer/lib/store/venue.store'
import { cn } from '@renderer/lib/utils'
import type { Venue } from '@shared/types/ipc'

interface Props {
  value: string | null
  onChange: (venueId: string | null) => void
}

function NewVenueDialog({
  open,
  onClose,
  onCreated
}: {
  open: boolean
  onClose: () => void
  onCreated: (venue: Venue) => void
}) {
  const { t } = useTranslation()
  const { create } = useVenueStore()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function reset() {
    setName('')
    setAddress('')
    setError('')
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError(t('validation.required'))
      return
    }
    setIsSubmitting(true)
    try {
      const venue = await create({ name: name.trim(), address: address.trim() || null })
      reset()
      onCreated(venue)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose() } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('venue.newTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('venue.name')}</label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder={t('venue.namePlaceholder')}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('venue.address')}</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('venue.addressPlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose() }}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function VenueSelect({ value, onChange }: Props) {
  const { t } = useTranslation()
  const { venues, load } = useVenueStore()
  const [showDialog, setShowDialog] = useState(false)

  useEffect(() => { load() }, [load])

  return (
    <div className="flex gap-2">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={cn(
          'flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
          'focus:outline-none focus:ring-1 focus:ring-ring'
        )}
      >
        <option value="">{t('venue.noVenue')}</option>
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      <Button variant="outline" size="sm" type="button" onClick={() => setShowDialog(true)}>
        <Plus className="h-4 w-4" />
        {t('venue.new')}
      </Button>
      <NewVenueDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onCreated={(venue) => {
          onChange(venue.id)
          setShowDialog(false)
        }}
      />
    </div>
  )
}
