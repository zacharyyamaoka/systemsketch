import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceDirectory,
  readWorkspaceDocument,
  isRetryableWorkspaceFailure,
  statWorkspaceDocument,
  WorkspaceConflict,
  WorkspaceRequestError,
  WorkspaceTransportError,
  WorkspaceRequestTimeout,
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
      signal: expect.any(AbortSignal),
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

  it('consumes the exact digest returned by stat', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      path: INPUT.path,
      mtime: 12,
      size: 99,
      digest: 'exact-bytes',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    await expect(statWorkspaceDocument(INPUT.path)).resolves.toMatchObject({
      digest: 'exact-bytes',
    })
  })

  it('bounds a stalled request with an actionable timeout', async () => {
    const fetch = vi.fn((_path: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    }))
    vi.stubGlobal('fetch', fetch)

    await expect(statWorkspaceDocument(INPUT.path, { timeoutMs: 5 }))
      .rejects.toBeInstanceOf(WorkspaceRequestTimeout)
  })

  it('lets a caller cancel an obsolete document read', async () => {
    const fetch = vi.fn((_path: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()

    const pending = readWorkspaceDocument(INPUT.path, { signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('classifies fetch TypeErrors at the request boundary, not arbitrary save work', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')))

    await expect(statWorkspaceDocument(INPUT.path))
      .rejects.toBeInstanceOf(WorkspaceTransportError)
  })

  it('retries only transient controller and transport failures', async () => {
    const permanent = new WorkspaceRequestError('invalid path', 400)
    const busy = new WorkspaceRequestError('try again', 503)

    expect(isRetryableWorkspaceFailure(permanent)).toBe(false)
    expect(isRetryableWorkspaceFailure(busy)).toBe(true)
    expect(isRetryableWorkspaceFailure(new WorkspaceRequestError('slow down', 429))).toBe(true)
    expect(isRetryableWorkspaceFailure(new WorkspaceRequestTimeout(5))).toBe(true)
    expect(isRetryableWorkspaceFailure(new WorkspaceTransportError('fetch failed'))).toBe(true)
    expect(isRetryableWorkspaceFailure(new TypeError('serialization failed'))).toBe(false)
    expect(isRetryableWorkspaceFailure(new Error('serialization failed'))).toBe(false)
  })
})
