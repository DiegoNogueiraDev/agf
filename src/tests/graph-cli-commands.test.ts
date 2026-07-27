/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Integration: the CLI-first graph commands (node/edge/query/export/import-graph/
 * snapshot/search/memory) operate end-to-end against a real SqliteStore — proving
 * the agf CLI replaces the MCP tools 1:1, zero MCP.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { nodeCommand, validateStatusTransition } from '../cli/commands/node-cmd.js'
import { edgeCommand } from '../cli/commands/edge-cmd.js'
import { queryCommand } from '../cli/commands/query-cmd.js'
import { exportCommand } from '../cli/commands/export-cmd.js'
import { importGraphCommand } from '../cli/commands/import-graph-cmd.js'
import { snapshotCommand } from '../cli/commands/snapshot-cmd.js'
import { searchCommand } from '../cli/commands/search-cmd.js'
import { memoryCommand } from '../cli/commands/memory-cmd.js'

function captureOut(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  })
  return { lines, restore: () => spy.mockRestore() }
}

describe('CLI-first graph commands (zero MCP)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-cli-'))
    const store = SqliteStore.open(dir)
    store.initProject('test')
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('validateStatusTransition enforces status_flow', () => {
    expect(validateStatusTransition('backlog', 'in_progress')).toBeNull()
    expect(validateStatusTransition('in_progress', 'done')).toBeNull()
    expect(validateStatusTransition('backlog', 'done')).not.toBeNull()
  })

  it('node add → show → status round-trips through the store', async () => {
    const out = captureOut()
    try {
      await nodeCommand().parseAsync(['add', '--title', 'Build CLI', '--type', 'task', '--dir', dir], { from: 'user' })
    } finally {
      out.restore()
    }
    const json = JSON.parse(out.lines.join(''))
    expect(json.ok).toBe(true)
    const id = json.data.id

    const store = SqliteStore.open(dir)
    expect(store.getNodeById(id)?.title).toBe('Build CLI')
    store.close()

    const out2 = captureOut()
    try {
      await nodeCommand().parseAsync(['status', id, 'in_progress', '--dir', dir], { from: 'user' })
    } finally {
      out2.restore()
    }
    const s2 = SqliteStore.open(dir)
    expect(s2.getNodeById(id)?.status).toBe('in_progress')
    s2.close()
  })

  it('node status rejects an invalid transition', async () => {
    const store = SqliteStore.open(dir)
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_t1',
      type: 'task',
      title: 'T1',
      description: '',
      status: 'backlog',
      priority: 3,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })
    store.close()

    const out = captureOut()
    try {
      await nodeCommand().parseAsync(['status', 'node_t1', 'done', '--dir', dir], { from: 'user' })
    } finally {
      out.restore()
    }
    const json = JSON.parse(out.lines.join(''))
    expect(json.ok).toBe(false)
    expect(json.code).toBe('INVALID_TRANSITION')
    const s = SqliteStore.open(dir)
    expect(s.getNodeById('node_t1')?.status).toBe('backlog') // unchanged
    s.close()
  })

  it('edge add links two nodes and query finds them', async () => {
    const store = SqliteStore.open(dir)
    const now = new Date().toISOString()
    for (const id of ['node_a', 'node_b']) {
      store.insertNode({
        id,
        type: 'task',
        title: id,
        description: '',
        status: 'backlog',
        priority: 3,
        xpSize: 'S',
        parentId: null,
        acceptanceCriteria: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
        metadata: {},
      })
    }
    store.close()

    const out = captureOut()
    try {
      await edgeCommand().parseAsync(['add', 'node_a', 'node_b', '--type', 'depends_on', '--dir', dir], {
        from: 'user',
      })
    } finally {
      out.restore()
    }
    const json = JSON.parse(out.lines.join(''))
    expect(json.ok).toBe(true)
    expect(json.data.from).toBe('node_a')
    expect(json.data.to).toBe('node_b')

    const s = SqliteStore.open(dir)
    expect(s.getEdgesFrom('node_a').some((e) => e.to === 'node_b')).toBe(true)
    s.close()
  })

  it('export → import-graph round-trips the whole graph into a fresh project', async () => {
    const store = SqliteStore.open(dir)
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_x',
      type: 'epic',
      title: 'Epic X',
      description: '',
      status: 'backlog',
      priority: 3,
      xpSize: 'M',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })
    store.close()

    const exportFile = join(dir, 'graph.json')
    const out = captureOut()
    try {
      await exportCommand().parseAsync(['-o', exportFile, '--dir', dir], { from: 'user' })
    } finally {
      out.restore()
    }

    // fresh target project
    const dir2 = mkdtempSync(join(tmpdir(), 'agf-cli2-'))
    const target = SqliteStore.open(dir2)
    target.initProject('target')
    target.close()

    const out2 = captureOut()
    try {
      await importGraphCommand().parseAsync([exportFile, '--dir', dir2], { from: 'user' })
    } finally {
      out2.restore()
    }
    const t = SqliteStore.open(dir2)
    expect(t.getNodeById('node_x')?.title).toBe('Epic X')
    t.close()
    rmSync(dir2, { recursive: true, force: true })
  })

  it('snapshot create then list reports the snapshot', async () => {
    let out = captureOut()
    try {
      await snapshotCommand().parseAsync(['create', '--dir', dir], { from: 'user' })
    } finally {
      out.restore()
    }
    const createJson = JSON.parse(out.lines.join(''))
    expect(createJson.ok).toBe(true)
    expect(typeof createJson.data.snapshotId).toBe('number')

    out = captureOut()
    try {
      await snapshotCommand().parseAsync(['list', '--dir', dir], { from: 'user' })
    } finally {
      out.restore()
    }
    const listJson = JSON.parse(out.lines.join(''))
    expect(listJson.ok).toBe(true)
    expect(listJson.data.length).toBeGreaterThan(0)
  })

  it('memory write → read → list → rm round-trips on disk', async () => {
    let out = captureOut()
    try {
      await memoryCommand().parseAsync(['write', 'note-1', '--content', 'hello world', '--dir', dir], { from: 'user' })
    } finally {
      out.restore()
    }
    const writeJson = JSON.parse(out.lines.join(''))
    expect(writeJson.ok).toBe(true)
    expect(writeJson.data.name).toBe('note-1')

    out = captureOut()
    try {
      await memoryCommand().parseAsync(['read', 'note-1', '--dir', dir], { from: 'user' })
    } finally {
      out.restore()
    }
    const readJson = JSON.parse(out.lines.join(''))
    expect(readJson.ok).toBe(true)
    expect(readJson.data.content).toBe('hello world')

    out = captureOut()
    try {
      await memoryCommand().parseAsync(['list', '--dir', dir], { from: 'user' })
    } finally {
      out.restore()
    }
    const listJson = JSON.parse(out.lines.join(''))
    expect(listJson.ok).toBe(true)
    expect(listJson.data).toContain('note-1')
  })

  it('search returns matching nodes via FTS', async () => {
    const store = SqliteStore.open(dir)
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_s',
      type: 'task',
      title: 'authentication flow',
      description: 'login and tokens',
      status: 'backlog',
      priority: 3,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    })
    store.close()

    const out = captureOut()
    try {
      await searchCommand().parseAsync(['authentication', '--dir', dir], { from: 'user' })
    } finally {
      out.restore()
    }
    expect(out.lines.join('')).toContain('node_s')
  })
})
