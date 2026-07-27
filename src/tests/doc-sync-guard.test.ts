import { describe, it, expect } from 'vitest'
import { DOC_DRIFT_AGE_DAYS, isDocSyncDisabled, hashDocContent, detectDocDrift } from '../core/hooks/doc-sync-guard.js'
import type { DocBaseline } from '../core/hooks/doc-sync-guard.js'

const DAY_MS = 24 * 60 * 60 * 1000
const now = 1_700_000_000_000

describe('DOC_DRIFT_AGE_DAYS', () => {
  it('is a positive number', () => {
    expect(DOC_DRIFT_AGE_DAYS).toBeGreaterThan(0)
  })
})

describe('isDocSyncDisabled', () => {
  it('returns false by default', () => {
    expect(isDocSyncDisabled({})).toBe(false)
  })

  it('returns true when env var is off', () => {
    expect(isDocSyncDisabled({ MCP_GRAPH_DOC_SYNC: 'off' })).toBe(true)
  })
})

describe('hashDocContent', () => {
  it('returns a non-empty string', () => {
    const hash = hashDocContent('some content')
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
  })

  it('returns different hashes for different content', () => {
    expect(hashDocContent('a')).not.toBe(hashDocContent('b'))
  })

  it('returns same hash for same content', () => {
    expect(hashDocContent('same')).toBe(hashDocContent('same'))
  })
})

describe('detectDocDrift', () => {
  it('returns no_baseline when baseline is absent', () => {
    const result = detectDocDrift({
      path: 'docs/foo.md',
      currentContent: 'hello',
      latestNodeUpdateMs: now,
      nowMs: now,
    })
    expect(result.reason).toBe('no_baseline')
    expect(result.drift).toBe(false)
  })

  it('returns content_changed (drift=false) when hash differs', () => {
    const baseline: DocBaseline = {
      path: 'docs/foo.md',
      hash: hashDocContent('old content'),
      recordedAt: now - DAY_MS,
    }
    const result = detectDocDrift({
      path: 'docs/foo.md',
      currentContent: 'new content',
      baseline,
      latestNodeUpdateMs: now,
      nowMs: now,
    })
    expect(result.drift).toBe(false)
    expect(result.reason).toBe('content_changed')
  })

  it('returns fresh when hash matches and doc is recent', () => {
    const content = 'same content'
    const baseline: DocBaseline = {
      path: 'docs/foo.md',
      hash: hashDocContent(content),
      recordedAt: now - DAY_MS,
    }
    const result = detectDocDrift({
      path: 'docs/foo.md',
      currentContent: content,
      baseline,
      latestNodeUpdateMs: now - 2 * DAY_MS,
      nowMs: now,
    })
    expect(result.drift).toBe(false)
    expect(result.reason).toBe('fresh')
  })

  it('detects stale_doc when age exceeds threshold', () => {
    const content = 'same content'
    const baseline: DocBaseline = {
      path: 'docs/foo.md',
      hash: hashDocContent(content),
      recordedAt: now - (DOC_DRIFT_AGE_DAYS + 1) * DAY_MS,
    }
    const result = detectDocDrift({
      path: 'docs/foo.md',
      currentContent: content,
      baseline,
      latestNodeUpdateMs: now,
      nowMs: now,
    })
    expect(result.drift).toBe(true)
    expect(result.reason).toBe('stale_doc')
  })
})
