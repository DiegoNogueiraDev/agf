/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/replan-analyze-cmd.ts — wires analyzeReplanSuggest
 * (node_wire_dee8d99c1caf), sibling of agf cycle-repair in the same
 * §EPIC-dynamic-replanning epic. Had zero real callers despite reading a real
 * node_changelog table.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { replanAnalyzeCommand } from '../cli/commands/replan-analyze-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await replanAnalyzeCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf replan-analyze (node_wire_dee8d99c1caf)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('detects real cycle-time divergence from node_changelog and proposes reprioritize', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-replan-'))
    const store = SqliteStore.open(dir)
    store.initProject('replan-test')
    const projectId = store.getActiveProject()!.id
    const now = new Date().toISOString()
    store.insertNode({
      id: 'slow-task',
      type: 'task',
      title: 'Slow task',
      status: 'done',
      priority: 3,
      xpSize: 'S',
      sprint: 'sprint-1',
      createdAt: now,
      updatedAt: now,
    } as GraphNode)

    const db = store.getDb()
    db.prepare(
      `INSERT INTO node_changelog (project_id, node_id, field, new_value, changed_at) VALUES (?, ?, 'status', 'in_progress', ?)`,
    ).run(projectId, 'slow-task', '2026-01-01T00:00:00Z')
    // xpSize 'S' = 60min estimate; actual = 3 hours = 300% of estimate (>50% divergence)
    db.prepare(
      `INSERT INTO node_changelog (project_id, node_id, field, new_value, changed_at) VALUES (?, ?, 'status', 'done', ?)`,
    ).run(projectId, 'slow-task', '2026-01-01T03:00:00Z')
    store.close()

    const result = await run(['--sprint', 'sprint-1', '-d', dir])
    expect(result.ok).toBe(true)
    const data = result.data as {
      healthStatus: string
      proposals: Array<{ action: string; nodeId: string }>
      metrics: { overdueTaskCount: number }
    }
    expect(data.healthStatus).toBe('unhealthy')
    expect(data.metrics.overdueTaskCount).toBe(1)
    expect(data.proposals[0].action).toBe('reprioritize')
    expect(data.proposals[0].nodeId).toBe('slow-task')
  })

  it('reports healthy for a sprint with no divergence or blocking patterns', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-replan-healthy-'))
    const store = SqliteStore.open(dir)
    store.initProject('replan-healthy-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 't1',
      type: 'task',
      title: 'Normal task',
      status: 'backlog',
      priority: 3,
      sprint: 'sprint-1',
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const result = await run(['--sprint', 'sprint-1', '-d', dir])
    expect((result.data as { healthStatus: string }).healthStatus).toBe('healthy')
  })
})
