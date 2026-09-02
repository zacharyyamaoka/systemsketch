import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceDirectory,
  WorkspaceConflict,
  flushWorkspaceDocument,
  writeWorkspaceDocument,
} from './workspaceClient'

const INPUT = {
  path: '/boards/Recovery.systemsketch',
  source: '{"valid":true}',
  baseDigest: null,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('workspace writes', () => {
  it('creates a directory through the confined workspace API', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: 'Architecture Ω',
      path: '/boards/Architecture Ω',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    await expect(createWorkspaceDirectory('/boards', 'Architecture Ω')).resolves.toEqual({
      name: 'Architecture Ω',
      path: '/boards/Architecture Ω',
    })
    expect(fetch).toHaveBeenCalledWith('/api/workspace/directory', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ parent: '/boards', name: 'Architecture Ω' }),
    }))
  })

  it('carries force=true on an explicit Save As replacement retry', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        conflict: true,
        error: 'Recovery.systemsketch already exists',
        mtime: 12,
        digest: 'disk',
      }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        path: INPUT.path,
        title: 'Recovery',
        digest: 'saved',
        mtime: 13,
        size: 20,
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    await expect(writeWorkspaceDocument(INPUT)).rejects.toBeInstanceOf(WorkspaceConflict)
    await writeWorkspaceDocument({ ...INPUT, force: true })

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ force: false })
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ force: true })
  })

  it('uses a digest-fenced keepalive request for the final pagehide flush', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
    vi.stubGlobal('fetch', fetch)

    await flushWorkspaceDocument({ ...INPUT, baseDigest: 'loaded-revision' })

    expect(fetch).toHaveBeenCalledOnce()
    const [, options] = fetch.mock.calls[0]
    expect(options.keepalive).toBe(true)
    expect(JSON.parse(options.body)).toEqual({
      ...INPUT,
      baseDigest: 'loaded-revision',
      force: false,
    })
  })
})
