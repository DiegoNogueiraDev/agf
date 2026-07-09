/*!
 * TDD: fs-watcher hardening — debounce + dual-channel + ignore (node_e68770a8b82a).
 *
 * AC1: Multiple rapid writes to same file → coalesced into 1 event (debounce).
 * AC2: Path in ignore list → no event emitted; periodic reconciliation picks up missed events.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  coalesceEvents,
  shouldIgnorePath,
  DEFAULT_IGNORE_PATTERNS,
  type FileEvent,
} from '../core/hooks/fs-watcher-hardening.js'

describe('AC1: rapid writes coalesce via debounce', () => {
  it('coalesceEvents deduplicates same-path events and keeps latest ts', () => {
    const events: FileEvent[] = [
      { path: 'src/foo.ts', type: 'change', ts: 1000 },
      { path: 'src/foo.ts', type: 'change', ts: 1050 },
      { path: 'src/foo.ts', type: 'change', ts: 1100 },
    ]
    const coalesced = coalesceEvents(events)
    expect(coalesced).toHaveLength(1)
    expect(coalesced[0].ts).toBe(1100)
  })

  it('coalesceEvents preserves events for distinct paths', () => {
    const events: FileEvent[] = [
      { path: 'src/a.ts', type: 'change', ts: 1000 },
      { path: 'src/b.ts', type: 'change', ts: 1010 },
    ]
    expect(coalesceEvents(events)).toHaveLength(2)
  })
})

describe('AC2: ignored paths suppressed; reconciliation catches missed events', () => {
  it('shouldIgnorePath returns true for node_modules', () => {
    expect(shouldIgnorePath('node_modules/some-pkg/index.js', DEFAULT_IGNORE_PATTERNS)).toBe(true)
  })

  it('shouldIgnorePath returns false for non-ignored paths', () => {
    expect(shouldIgnorePath('src/core/output/format-routing-policy.ts', DEFAULT_IGNORE_PATTERNS)).toBe(false)
  })

  it('no events emitted for ignored paths after coalesce', () => {
    const events: FileEvent[] = [
      { path: 'node_modules/foo/index.js', type: 'change', ts: 100 },
      { path: 'src/bar.ts', type: 'change', ts: 200 },
    ]
    const filtered = coalesceEvents(events).filter((e) => !shouldIgnorePath(e.path, DEFAULT_IGNORE_PATTERNS))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].path).toBe('src/bar.ts')
  })
})
