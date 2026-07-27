/*!
 * TDD: wire-dormant-ingest — converts dormant capabilities into WIRE-tasks (node_8f6925631bfa).
 *
 * AC1: given dormant entries, buildWireTasks returns 1 WIRE-task per dormant.
 * AC2: allowlisted / already-queued entries are skipped (dedup).
 * AC3: dry-run default — no mutation, returns what-would-happen.
 * AC4: running twice with commit is idempotent (no duplicates).
 */

import { describe, it, expect } from 'vitest'
import { buildWireTasks, type WireIngestInput, type WireIngestResult } from '../core/harness/wire-dormant-ingest.js'

const DORMANT_ENTRIES = [
  { module: 'src/core/utils/rag-out.ts', reason: 'no-surface' as const },
  { module: 'src/core/lsp/diagnostics.ts', reason: 'no-surface' as const },
]

describe('AC1: buildWireTasks generates 1 WIRE-task per dormant', () => {
  it('returns one task per dormant entry', () => {
    const input: WireIngestInput = {
      dormant: DORMANT_ENTRIES,
      existingModules: new Set(),
      allowlist: [],
    }
    const result: WireIngestResult = buildWireTasks(input)
    expect(result.tasks.length).toBe(2)
    expect(result.skipped).toBe(0)
  })

  it('each task has title containing WIRE and the module basename', () => {
    const input: WireIngestInput = {
      dormant: [{ module: 'src/core/utils/rag-out.ts', reason: 'no-surface' }],
      existingModules: new Set(),
      allowlist: [],
    }
    const result = buildWireTasks(input)
    expect(result.tasks[0].title).toMatch(/WIRE/i)
    expect(result.tasks[0].title).toMatch(/rag-out/)
  })

  it('each task has description with module path and surface suggestion', () => {
    const input: WireIngestInput = {
      dormant: [{ module: 'src/core/utils/rag-out.ts', reason: 'no-surface' }],
      existingModules: new Set(),
      allowlist: [],
    }
    const result = buildWireTasks(input)
    const desc = result.tasks[0].description ?? ''
    expect(desc).toContain('src/core/utils/rag-out.ts')
  })
})

describe('AC2: allowlisted and already-queued entries are skipped', () => {
  it('skips entries in allowlist', () => {
    const input: WireIngestInput = {
      dormant: DORMANT_ENTRIES,
      existingModules: new Set(),
      allowlist: ['src/core/utils/rag-out.ts'],
    }
    const result = buildWireTasks(input)
    expect(result.tasks.length).toBe(1)
    expect(result.skipped).toBe(1)
  })

  it('deduplicates against already-queued modules', () => {
    const input: WireIngestInput = {
      dormant: DORMANT_ENTRIES,
      existingModules: new Set(['src/core/utils/rag-out.ts']),
      allowlist: [],
    }
    const result = buildWireTasks(input)
    expect(result.tasks.length).toBe(1)
    expect(result.skipped).toBe(1)
  })
})

describe('AC3: dry-run returns preview without mutation signal', () => {
  it('dryRun=true returns tasks but signals no commit', () => {
    const input: WireIngestInput = {
      dormant: DORMANT_ENTRIES,
      existingModules: new Set(),
      allowlist: [],
      dryRun: true,
    }
    const result = buildWireTasks(input)
    expect(result.tasks.length).toBe(2)
    expect(result.committed).toBe(false)
  })

  it('dryRun=false (commit) marks result as committed', () => {
    const input: WireIngestInput = {
      dormant: DORMANT_ENTRIES,
      existingModules: new Set(),
      allowlist: [],
      dryRun: false,
    }
    const result = buildWireTasks(input)
    expect(result.committed).toBe(true)
  })
})

describe('AC4: idempotent — second run with same modules produces 0 tasks', () => {
  it('all tasks skipped when all modules already queued', () => {
    const alreadyQueued = new Set(DORMANT_ENTRIES.map((d) => d.module))
    const input: WireIngestInput = {
      dormant: DORMANT_ENTRIES,
      existingModules: alreadyQueued,
      allowlist: [],
    }
    const result = buildWireTasks(input)
    expect(result.tasks.length).toBe(0)
    expect(result.skipped).toBe(2)
  })
})
