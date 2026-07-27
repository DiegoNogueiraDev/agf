/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Wires the dormant validator/validation.ts (ValidationInputSchema) into a
 * new `agf validate` surface — report-only dispatch across the validator/
 * checkers, keyed by --action.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { validateCommand } from '../cli/commands/validate-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function lastEnvelope(captured: string[]): {
  ok: boolean
  code?: string
  error?: string
  data?: Record<string, unknown>
} {
  const objs = captured
    .join('')
    .trim()
    .split('\n')
    .filter((l) => l.trim().startsWith('{') && l.includes('"ok"'))
  return JSON.parse(objs[objs.length - 1])
}

describe('validate command (node_wire_4002420be812 — validator/validation.ts wire)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-validate-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function runValidate(args: string[]): Promise<ReturnType<typeof lastEnvelope>> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    const prevExit = process.exitCode
    await validateCommand().parseAsync([...args, '-d', dir], { from: 'user' })
    spy.mockRestore()
    process.exitCode = prevExit
    return lastEnvelope(out)
  }

  it('rejects an unknown --action with a structured error (Zod boundary validation)', async () => {
    SqliteStore.open(dir).initProject('validate-test')
    const env = await runValidate(['--action', 'bogus'])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('INVALID_INPUT')
  })

  it('defaults to --action integrity and returns the validator report', async () => {
    SqliteStore.open(dir).initProject('validate-test')
    const env = await runValidate([])
    expect(env.ok).toBe(true)
    expect(env.data?.action).toBe('integrity')
    expect(env.data?.validator).toBeDefined()
  })

  it('--action dor returns the graph-level readiness report', async () => {
    SqliteStore.open(dir).initProject('validate-test')
    const env = await runValidate(['--action', 'dor'])
    expect(env.ok).toBe(true)
    expect(env.data?.dor).toBeDefined()
  })

  it('--action dod requires --node', async () => {
    SqliteStore.open(dir).initProject('validate-test')
    const env = await runValidate(['--action', 'dod'])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('NODE_ID_REQUIRED')
  })

  it('--action dod with --node runs the real DoD check for that node', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('validate-test')
    const now = new Date().toISOString()
    const node: GraphNode = {
      id: 'node_bare',
      type: 'task',
      title: 'bare task with no AC',
      status: 'backlog',
      priority: 3,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    }
    store.insertNode(node)
    store.close()

    const env = await runValidate(['--action', 'dod', '--node', 'node_bare'])
    expect(env.ok).toBe(true)
    expect(env.data?.nodeId).toBe('node_bare')
    expect((env.data?.dod as { ready?: boolean })?.ready).toBe(false)
  })
})
