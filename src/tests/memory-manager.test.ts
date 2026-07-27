/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 3.2 AC coverage: memory-manager.ts
 *
 * AC1: GIVEN two providers return memory with same content hash
 *      WHEN memory-manager deduplicates THEN returns only one entry
 * AC2: GIVEN external provider fails WHEN builtin provider works
 *      THEN manager returns builtin result without propagating the error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MemoryProvider, MemoryResult, ConversationContext } from '../core/memory/provider-interface.js'

vi.mock('../core/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  })),
}))
vi.mock('../core/utils/errors.js', () => ({
  OperationError: class OperationError extends Error {},
}))

import { MemoryManager } from '../core/memory/memory-manager.js'

// ── Factories ─────────────────────────────────────────────────────────────────

const CTX: ConversationContext = {
  sessionId: 'sess_test',
  recentMessages: [{ role: 'user', content: 'hello' }],
}

function makeResult(id: string, content: string, source = 'test'): MemoryResult {
  return { id, content, source }
}

function makeProvider(name: string, results: MemoryResult[] = [], syncFn?: () => Promise<void>): MemoryProvider {
  return {
    name,
    prefetch: vi.fn().mockResolvedValue(results),
    syncTurn: syncFn ? vi.fn().mockImplementation(syncFn) : vi.fn().mockResolvedValue(undefined),
    getToolSchemas: vi.fn().mockReturnValue([]),
  }
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('MemoryManager constructor', () => {
  it('creates successfully with only builtin provider', () => {
    const builtin = makeProvider('builtin')
    expect(() => new MemoryManager(builtin)).not.toThrow()
  })

  it('creates successfully with builtin + one external provider', () => {
    const builtin = makeProvider('builtin')
    const external = makeProvider('external')
    expect(() => new MemoryManager(builtin, external)).not.toThrow()
  })

  it('throws when more than one external provider given', () => {
    const builtin = makeProvider('builtin')
    const ext1 = makeProvider('ext1')
    const ext2 = makeProvider('ext2')
    expect(() => new MemoryManager(builtin, ext1, ext2)).toThrow()
  })

  it('ignores undefined external providers', () => {
    const builtin = makeProvider('builtin')
    expect(() => new MemoryManager(builtin, undefined, undefined)).not.toThrow()
  })

  it('one undefined + one defined is fine (only 1 external)', () => {
    const builtin = makeProvider('builtin')
    const ext = makeProvider('ext')
    expect(() => new MemoryManager(builtin, undefined, ext)).not.toThrow()
  })
})

// ── prefetchAll: basic behavior ───────────────────────────────────────────────

describe('prefetchAll: basic', () => {
  it('returns empty array when builtin returns nothing', async () => {
    const mgr = new MemoryManager(makeProvider('builtin', []))
    const results = await mgr.prefetchAll(CTX)
    expect(results).toHaveLength(0)
  })

  it('returns builtin results when no external provider', async () => {
    const mgr = new MemoryManager(makeProvider('builtin', [makeResult('r1', 'hello'), makeResult('r2', 'world')]))
    const results = await mgr.prefetchAll(CTX)
    expect(results).toHaveLength(2)
  })

  it('merges builtin + external results with no overlap', async () => {
    const builtin = makeProvider('builtin', [makeResult('r1', 'content-a')])
    const external = makeProvider('external', [makeResult('r2', 'content-b')])
    const mgr = new MemoryManager(builtin, external)
    const results = await mgr.prefetchAll(CTX)
    expect(results).toHaveLength(2)
  })
})

// ── AC1: deduplication by content hash ───────────────────────────────────────

describe('AC1: deduplication by content hash', () => {
  it('returns only one entry when both providers return same content (AC1)', async () => {
    const sharedContent = 'identical content for dedup test'
    const builtin = makeProvider('builtin', [makeResult('r1', sharedContent)])
    const external = makeProvider('external', [makeResult('r2', sharedContent)]) // same content, different id
    const mgr = new MemoryManager(builtin, external)
    const results = await mgr.prefetchAll(CTX)
    expect(results).toHaveLength(1)
  })

  it('keeps both when contents differ (AC1: no false dedup)', async () => {
    const builtin = makeProvider('builtin', [makeResult('r1', 'content-A')])
    const external = makeProvider('external', [makeResult('r2', 'content-B')])
    const mgr = new MemoryManager(builtin, external)
    const results = await mgr.prefetchAll(CTX)
    expect(results).toHaveLength(2)
  })

  it('deduplicates across 3+ same-content results from one provider (AC1)', async () => {
    const same = 'same content'
    const builtin = makeProvider('builtin', [makeResult('r1', same), makeResult('r2', same), makeResult('r3', same)])
    const mgr = new MemoryManager(builtin)
    const results = await mgr.prefetchAll(CTX)
    expect(results).toHaveLength(1)
  })

  it('preserves order: builtin first, external second (AC1: builtin wins dedup)', async () => {
    const sharedContent = 'overlap content'
    const builtin = makeProvider('builtin', [makeResult('builtin-r', sharedContent)])
    const external = makeProvider('external', [makeResult('external-r', sharedContent)])
    const mgr = new MemoryManager(builtin, external)
    const results = await mgr.prefetchAll(CTX)
    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe('builtin-r') // builtin comes first
  })

  it('unique contents from multiple providers all survive', async () => {
    const builtin = makeProvider('builtin', [makeResult('r1', 'alpha'), makeResult('r2', 'beta')])
    const external = makeProvider('external', [makeResult('r3', 'gamma')])
    const mgr = new MemoryManager(builtin, external)
    const results = await mgr.prefetchAll(CTX)
    expect(results).toHaveLength(3)
  })
})

// ── AC2: external provider failure isolation ──────────────────────────────────

describe('AC2: external provider failure isolation', () => {
  it('returns builtin results when external prefetch throws (AC2)', async () => {
    const builtin = makeProvider('builtin', [makeResult('r1', 'safe content')])
    const external = makeProvider('external')
    vi.mocked(external.prefetch).mockRejectedValue(new Error('network timeout'))
    const mgr = new MemoryManager(builtin, external)
    const results = await mgr.prefetchAll(CTX)
    expect(results).toHaveLength(1)
    expect(results[0]!.content).toBe('safe content')
  })

  it('does not throw when external prefetch fails (AC2: error isolation)', async () => {
    const builtin = makeProvider('builtin', [makeResult('r1', 'ok')])
    const external = makeProvider('external')
    vi.mocked(external.prefetch).mockRejectedValue(new Error('external down'))
    const mgr = new MemoryManager(builtin, external)
    await expect(mgr.prefetchAll(CTX)).resolves.not.toThrow()
  })

  it('returns empty array when builtin returns nothing and external fails', async () => {
    const builtin = makeProvider('builtin', [])
    const external = makeProvider('external')
    vi.mocked(external.prefetch).mockRejectedValue(new Error('down'))
    const mgr = new MemoryManager(builtin, external)
    const results = await mgr.prefetchAll(CTX)
    expect(results).toHaveLength(0)
  })

  it('calls builtin.prefetch with the provided context', async () => {
    const builtin = makeProvider('builtin', [])
    const mgr = new MemoryManager(builtin)
    await mgr.prefetchAll(CTX)
    expect(builtin.prefetch).toHaveBeenCalledWith(CTX)
  })

  it('calls external.prefetch when external provider present', async () => {
    const builtin = makeProvider('builtin', [])
    const external = makeProvider('external', [])
    const mgr = new MemoryManager(builtin, external)
    await mgr.prefetchAll(CTX)
    expect(external.prefetch).toHaveBeenCalledWith(CTX)
  })
})

// ── buildFencedBlock ──────────────────────────────────────────────────────────

describe('buildFencedBlock', () => {
  let mgr: MemoryManager

  beforeEach(() => {
    mgr = new MemoryManager(makeProvider('builtin'))
  })

  it('wraps results in memory-context tags', () => {
    const results = [makeResult('r1', 'content here')]
    const block = mgr.buildFencedBlock(results)
    expect(block).toContain('<memory-context>')
    expect(block).toContain('</memory-context>')
  })

  it('includes content from results', () => {
    const results = [makeResult('r1', 'some memory')]
    const block = mgr.buildFencedBlock(results)
    expect(block).toContain('some memory')
  })

  it('joins multiple results with double newline', () => {
    const results = [makeResult('r1', 'first'), makeResult('r2', 'second')]
    const block = mgr.buildFencedBlock(results)
    expect(block).toContain('first\n\nsecond')
  })

  it('returns empty-body block for empty results', () => {
    const block = mgr.buildFencedBlock([])
    expect(block).toContain('<memory-context>')
    expect(block).toContain('</memory-context>')
    expect(block.trim()).toBe('<memory-context>\n\n</memory-context>')
  })
})

// ── syncTurnAll ───────────────────────────────────────────────────────────────

describe('syncTurnAll', () => {
  const TURN = { role: 'user', content: 'Hello world' }

  it('calls builtin.syncTurn with turn data', async () => {
    const builtin = makeProvider('builtin')
    const mgr = new MemoryManager(builtin)
    await mgr.syncTurnAll(TURN)
    expect(builtin.syncTurn).toHaveBeenCalledWith(TURN)
  })

  it('calls external.syncTurn when external provider present', async () => {
    const builtin = makeProvider('builtin')
    const external = makeProvider('external')
    const mgr = new MemoryManager(builtin, external)
    await mgr.syncTurnAll(TURN)
    expect(external.syncTurn).toHaveBeenCalledWith(TURN)
  })

  it('does not propagate external syncTurn error (AC2)', async () => {
    const builtin = makeProvider('builtin')
    const external = makeProvider('external', [], async () => {
      throw new Error('sync failed')
    })
    const mgr = new MemoryManager(builtin, external)
    await expect(mgr.syncTurnAll(TURN)).resolves.not.toThrow()
  })

  it('builtin syncTurn still called when external throws', async () => {
    const builtin = makeProvider('builtin')
    const external = makeProvider('external', [], async () => {
      throw new Error('sync failed')
    })
    const mgr = new MemoryManager(builtin, external)
    await mgr.syncTurnAll(TURN)
    expect(builtin.syncTurn).toHaveBeenCalledOnce()
  })
})
