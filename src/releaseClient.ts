export type ReleaseChannel = 'stable' | 'preview'
export type ReleaseAction = 'preview' | 'stable' | 'promote' | 'rollback'

export interface ReleaseStatus {
  product: 'systemsketch'
  channel: ReleaseChannel
  build: string
  stable: string | null
  candidate: string | null
  previous: string | null
  version: string
  releasedAt: string | null
  changes: string[]
  isCurrent: boolean
  sourceChanged: boolean
  canPreview: boolean
  canPromote: boolean
  canRollback: boolean
  launchUrl?: string
  message?: string
}

async function readResponse(response: Response): Promise<ReleaseStatus> {
  const payload = await response.json() as Partial<ReleaseStatus> & { error?: unknown }
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'SystemSketch update action failed.')
  }
  return payload as ReleaseStatus
}

export async function readReleaseStatus(): Promise<ReleaseStatus> {
  return readResponse(await fetch('/api/release'))
}

export async function runReleaseAction(action: ReleaseAction): Promise<ReleaseStatus> {
  return readResponse(await fetch('/api/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  }))
}
