/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/verify-ac-cmd.ts — verifyAcCommand factory wiring.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { verifyAcCommand } from '../cli/commands/verify-ac-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('verifyAcCommand', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-verify-ac-cmd-'))
    const store = SqliteStore.open(dir)
    store.initProject('verify-ac-cmd-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_target',
      type: 'task',
      title: 'target',
      status: 'backlog',
      priority: 2,
      acceptanceCriteria: ['the system should be fast'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('builds the "verify-ac" command with a description', () => {
    const cmd = verifyAcCommand()
    expect(cmd.name()).toBe('verify-ac')
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('GIVEN a vague AC WHEN verify-ac runs THEN the envelope reports status unclear', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await verifyAcCommand().parseAsync(['node_target', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as Record<string, unknown>
    expect(data.status).toBe('unclear')
  })

  it("GIVEN a nonexistent node id THEN out.err('NOT_FOUND') is returned", async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await verifyAcCommand().parseAsync(['node_missing', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(false)
  })
})
