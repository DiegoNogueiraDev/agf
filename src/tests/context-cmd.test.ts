/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for context command default compressed behavior.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contextCommand } from '../cli/commands/context-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('context command', () => {
  it('exports contextCommand function', () => {
    expect(typeof contextCommand).toBe('function')
  })

  it('registers --compressed with default true', () => {
    const cmd = contextCommand()
    const compressedOpt = cmd.options.find((o) => o.long === '--compressed')
    expect(compressedOpt).toBeDefined()
    expect(compressedOpt!.defaultValue).toBe(true)
  })

  it('registers --full flag for explicit uncompressed mode', () => {
    const cmd = contextCommand()
    const fullOpt = cmd.options.find((o) => o.long === '--full')
    expect(fullOpt).toBeDefined()
  })

  it('has --format option with default json', () => {
    const cmd = contextCommand()
    const formatOpt = cmd.options.find((o) => o.long === '--format')
    expect(formatOpt).toBeDefined()
    expect(formatOpt!.defaultValue).toBe('json')
  })
})

describe('agf context domain-skills injection (node_wire_cd98047410c5 — domain-skill-retrieval wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await contextCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('surfaces a real domain skill matching the task title/description', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-context-domainskills-'))
    const store = SqliteStore.open(dir)
    store.initProject('context-domainskills-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'task-sqlite-perf',
      type: 'task',
      title: 'Optimize sqlite prepared statement reuse',
      description: 'Speed up the hot query path.',
      status: 'backlog',
      priority: 2,
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const skillsDir = join(dir, 'workflow-graph', 'domain-skills', 'sqlite-perf')
    mkdirSync(skillsDir, { recursive: true })
    writeFileSync(
      join(skillsDir, 'prepared-statements.md'),
      `---
domain: sqlite-perf
topic: prepared-statements
triggers: [sqlite, prepared statement]
discovered_at: 2026-07-05T00:00:00.000Z
source_task: task-sqlite-perf
confidence: 0.7
---

Reuse prepared statements across calls for hot-path queries.
`,
    )

    const result = await run(['task-sqlite-perf', '-d', dir])
    expect(result.ok).toBe(true)
    const data = result.data as { domainSkills?: string }
    expect(data.domainSkills).toBeDefined()
    expect(data.domainSkills).toContain('sqlite-perf/prepared-statements')
  })

  it('a task with no matching domain skill has no domainSkills field', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-context-nodomainskills-'))
    const store = SqliteStore.open(dir)
    store.initProject('context-nodomainskills-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'task-unrelated',
      type: 'task',
      title: 'Update the changelog',
      description: 'Nothing special here.',
      status: 'backlog',
      priority: 2,
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const result = await run(['task-unrelated', '-d', dir])
    expect(result.ok).toBe(true)
    expect((result.data as { domainSkills?: unknown }).domainSkills).toBeUndefined()
  })
})
