import { useState } from 'react'
import { Globe, Copy, Check, Upload } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { useAppSettings } from '@renderer/contexts/AppSettingsContext'
import { PUBLISH_SITE_URL } from '@shared/publish-config'

interface Props {
  tournamentId: string
}

function mapError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('PUBLISH_TOKEN_NOT_SET')) return 'Publish token is not configured. Go to app settings.'
  if (msg.includes('INVALID_PUBLISH_TOKEN')) return 'Invalid publish token. Check app settings.'
  if (msg.includes('PUBLISH_FAILED')) return 'Server error during publish. Try again later.'
  if (msg.includes('fetch')) return 'Network error. Check your connection.'
  return `Publish failed: ${msg}`
}

export function PublishPanel({ tournamentId }: Props) {
  const { settings } = useAppSettings()
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishedAt, setPublishedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const hasToken = settings.publishToken.length > 0
  const publicUrl = `${PUBLISH_SITE_URL}/${tournamentId}`

  async function handlePublish() {
    setIsPublishing(true)
    setError(null)
    try {
      const result = await api.exportApi.publish(tournamentId)
      setPublishedAt(result.publishedAt)
    } catch (err) {
      setError(mapError(err))
    } finally {
      setIsPublishing(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mt-6 space-y-2">
      {/* URL row */}
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="truncate text-sm text-blue-600 hover:underline"
        >
          {publicUrl}
        </a>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleCopy}
          title="Copy link"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={handlePublish}
          disabled={isPublishing || !hasToken}
          title={!hasToken ? 'Set publish token in app settings' : undefined}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {isPublishing ? 'Publishing…' : 'Publish'}
        </Button>

        {publishedAt && !error && (
          <span className="text-xs text-muted-foreground">
            Published {new Date(publishedAt).toLocaleString()}
          </span>
        )}

        {error && (
          <span className="text-xs text-destructive">{error}</span>
        )}
      </div>
    </div>
  )
}
