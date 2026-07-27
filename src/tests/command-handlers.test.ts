/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { mapCmdToIntent, dispatchSimpleCommand, type SubmitContext } from '../tui/command-handlers.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('mapCmdToIntent', () => {
  it('maps data-viewing commands to data-extract', () => {
    expect(mapCmdToIntent('stats')).toBe('data-extract')
    expect(mapCmdToIntent('metrics')).toBe('data-extract')
  })

  it('maps review commands to code-review', () => {
    expect(mapCmdToIntent('check')).toBe('code-review')
    expect(mapCmdToIntent('quality')).toBe('code-review')
  })

  it('maps doc-like commands to doc', () => {
    expect(mapCmdToIntent('skills')).toBe('doc')
    expect(mapCmdToIntent('principles')).toBe('doc')
    expect(mapCmdToIntent('help')).toBe('doc')
    expect(mapCmdToIntent('feedback')).toBe('doc')
  })

  it('maps report-like commands to report', () => {
    expect(mapCmdToIntent('build')).toBe('report')
    expect(mapCmdToIntent('phase')).toBe('report')
  })

  it('returns undefined for an unmapped command', () => {
    expect(mapCmdToIntent('not-a-real-command')).toBeUndefined()
  })
})

describe('/wake-up dispatch', () => {
  function makeStore(): SqliteStore {
    const store = SqliteStore.open(':memory:')
    store.initProject('test-wake-up')
    store.insertNode({
      id: 'node_done1',
      type: 'task',
      title: 'Fixed cache invalidation bug in the store layer',
      status: 'done',
      priority: 1,
      xpSize: 'M',
      tags: [],
      blocked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as GraphNode)
    return store
  }

  function makeCtx(store: SqliteStore, lines: string[]): SubmitContext {
    return {
      dashboard: { projectName: 'test-project' },
      store,
      append: (line: string) => lines.push(line),
      pushStatus: () => {},
    } as unknown as SubmitContext
  }

  it('with a query, ranks recent done-work memory via searchL2/searchL3 (wired dormant capability)', () => {
    const store = makeStore()
    const lines: string[] = []
    const ctx = makeCtx(store, lines)
    const handled = dispatchSimpleCommand(ctx, { cmd: 'wake-up', args: 'cache' }, 'wake-up cache')
    expect(handled).toBe(true)
    expect(lines.some((l) => l.includes('[L2:on-demand:cache]'))).toBe(true)
    store.close()
  })

  it('with no query, behaves as before (no L2/L3 lines)', () => {
    const store = makeStore()
    const lines: string[] = []
    const ctx = makeCtx(store, lines)
    dispatchSimpleCommand(ctx, { cmd: 'wake-up', args: '' }, 'wake-up')
    expect(lines.some((l) => l.includes('[L2:on-demand:'))).toBe(false)
    store.close()
  })
})
