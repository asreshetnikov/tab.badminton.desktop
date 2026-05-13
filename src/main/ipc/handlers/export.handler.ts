import { ipcMain } from 'electron'
import { getDb } from '../../db/client'
import { buildSnapshot } from '../../services/export.service'
import { getAppSettings } from '../../services/app-settings.service'
import { PUBLISH_SITE_URL, PUBLISH_API_URL } from '../../../shared/publish-config'
import type { PublishResult } from '../../../shared/types/ipc'

export function registerExportHandler(): void {
  ipcMain.handle('exportApi:publish', (_e, tournamentId: string) =>
    publishTournament(tournamentId)
  )
}

async function publishTournament(tournamentId: string): Promise<PublishResult> {
  const { publishToken } = getAppSettings()

  if (!publishToken) throw new Error('PUBLISH_TOKEN_NOT_SET')

  const snapshot = buildSnapshot(getDb(), tournamentId)

  const res = await fetch(PUBLISH_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${publishToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tournamentId, snapshot }),
  })

  if (res.status === 401) throw new Error('INVALID_PUBLISH_TOKEN')
  if (!res.ok) throw new Error(`PUBLISH_FAILED_${res.status}`)

  const { publishedAt } = await res.json()
  return { url: `${PUBLISH_SITE_URL}/${tournamentId}`, publishedAt }
}
