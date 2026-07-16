/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Gate attempt escalation — tracks per-task gate failures via metadata.gateAttempts
 * and escalates (ESCALATION_REQUIRED) on the 3rd consecutive red.
 *
 * AC1: gateAttempts=2 → gate fails → ESCALATION_REQUIRED with applyVia
 * AC2: gateAttempts=3 → immediate ESCALATION_REQUIRED (no test-cmd run)
 * AC3: gate passes → gateAttempts zeroed
 * AC4: absent/corrupt metadata → treat as 0 → increment to 1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { doneCommand } from '../cli/commands/done-cmd.js'
import { checkCommand } from '../cli/commands/check-cmd.js'
import { getGateAttempts, MAX_GATE_ATTEMPTS } from '../core/implementer/gate-attempt-tracker.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('gate attempt escalation — integration via done-cmd', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-gate-attempt-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email test@test.com', { cwd: dir })
    execSync('git config user.name test', { cwd: dir })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    writeFileSync(join(dir, '.gitignore'), 'workflow-graph/\n')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1\n')
    execSync('git add -A && git commit -q -m baseline', { cwd: dir })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function runDone(taskId: string, args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const origWrite = process.stdout.write
    process.stdout.write = (chunk: unknown) => {
      out.push(String(chunk))
      return true
    }
    try {
      await doneCommand().parseAsync([taskId, '-d', dir, ...args], { from: 'user' })
    } finally {
      process.stdout.write = origWrite
    }
    const lines = out.join('').trim().split('\n')
    const last = lines[lines.length - 1]
    return last ? JSON.parse(last) : {}
  }

  // ── AC1 ──────────────────────────────────────────────────────────────

  it('AC1: gateAttempts=2 → gate fails → ESCALATION_REQUIRED with applyVia', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('gate-attempt-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_tryfail',
      type: 'task',
      title: 'fragile task',
      status: 'in_progress',
      priority: 3,
      metadata: { gateAttempts: 2 },
      tags: ['test'],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const envelope = await runDone('node_tryfail', ['--skip-test'])
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('ESCALATION_REQUIRED')
    expect(envelope.data?.applyVia).toBeDefined()
    expect(typeof envelope.data?.applyVia).toBe('string')
    expect(envelope.data?.applyVia).toContain('node add --type bug')

    const verifyStore = SqliteStore.open(dir)
    const node = verifyStore.getNodeById('node_tryfail')
    verifyStore.close()
    const attempts = node?.metadata ? getGateAttempts(node.metadata as Record<string, unknown>) : 0
    expect(attempts).toBe(MAX_GATE_ATTEMPTS)
  })

  // ── AC2 ──────────────────────────────────────────────────────────────

  it('AC2: gateAttempts=3 → immediate ESCALATION_REQUIRED (no test-cmd run — economy)', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('gate-attempt-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_escalated',
      type: 'task',
      title: 'already escalated task',
      status: 'in_progress',
      priority: 3,
      metadata: { gateAttempts: 3 },
      acceptanceCriteria: ['Given X, When Y, Then Z'],
      tags: ['test'],
      testFiles: ['src/a.ts'],
      implementationFiles: ['src/a.ts'],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const envelope = await runDone('node_escalated', ['--skip-test'])
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('ESCALATION_REQUIRED')

    const verifyStore = SqliteStore.open(dir)
    const node = verifyStore.getNodeById('node_escalated')
    verifyStore.close()
    const attempts = node?.metadata ? getGateAttempts(node.metadata as Record<string, unknown>) : -1
    expect(attempts).toBe(3)
  })

  // ── AC3 ──────────────────────────────────────────────────────────────

  it('AC3: all gates pass → gateAttempts zeroed', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('gate-attempt-test')
    const now = new Date().toISOString()

    writeFileSync(join(dir, 'src/impl.ts'), 'export const impl = 42\n')
    writeFileSync(join(dir, 'src/impl.test.ts'), 'import { describe, it, expect } from "vitest"\n')
    execSync('git add -A && git commit -q -m "add impl files"', { cwd: dir })

    store.insertNode({
      id: 'node_green',
      type: 'task',
      title: 'task that passes',
      status: 'in_progress',
      priority: 3,
      metadata: { gateAttempts: 2 },
      acceptanceCriteria: ['Given X, When Y, Then a concrete observable outcome Z happens'],
      tags: ['test'],
      testFiles: ['src/impl.ts'],
      implementationFiles: ['src/impl.ts'],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const envelope = await runDone('node_green', ['--skip-test'])
    expect(envelope.ok).toBe(true)

    const verifyStore = SqliteStore.open(dir)
    const node = verifyStore.getNodeById('node_green')
    verifyStore.close()
    expect(node?.metadata?.gateAttempts).toBeUndefined()
  })

  // ── AC4 ──────────────────────────────────────────────────────────────

  it('AC4: absent metadata → treat as 0 → increment to 1 without throwing', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('gate-attempt-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_absent',
      type: 'task',
      title: 'no attempts metadata',
      status: 'in_progress',
      priority: 3,
      tags: ['test'],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const envelope = await runDone('node_absent', ['--skip-test'])
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('DOD_FAILED')

    const verifyStore = SqliteStore.open(dir)
    const node = verifyStore.getNodeById('node_absent')
    verifyStore.close()
    const attempts = node?.metadata ? getGateAttempts(node.metadata as Record<string, unknown>) : -1
    expect(attempts).toBe(1)
  })

  it('AC4b: corrupt metadata (non-number) → treat as 0 → increment to 1', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('gate-attempt-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_corrupt',
      type: 'task',
      title: 'corrupt attempts metadata',
      status: 'in_progress',
      priority: 3,
      metadata: { gateAttempts: 'banana' },
      tags: ['test'],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const envelope = await runDone('node_corrupt', ['--skip-test'])
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('DOD_FAILED')

    const verifyStore = SqliteStore.open(dir)
    const node = verifyStore.getNodeById('node_corrupt')
    verifyStore.close()
    const attempts = node?.metadata ? getGateAttempts(node.metadata as Record<string, unknown>) : -1
    expect(attempts).toBe(1)
  })
})

describe('gate attempt escalation — check-cmd', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-check-attempt-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email test@test.com', { cwd: dir })
    execSync('git config user.name test', { cwd: dir })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    writeFileSync(join(dir, '.gitignore'), 'workflow-graph/\n')
    execSync('git add -A && git commit -q -m baseline', { cwd: dir })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function runCheck(nodeId: string, args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const origWrite = process.stdout.write
    process.stdout.write = (chunk: unknown) => {
      out.push(String(chunk))
      return true
    }
    try {
      await checkCommand().parseAsync([nodeId, '-d', dir, ...args], { from: 'user' })
    } finally {
      process.stdout.write = origWrite
    }
    const lines = out.join('').trim().split('\n')
    const last = lines[lines.length - 1]
    return last ? JSON.parse(last) : {}
  }

  it('check increments gateAttempts and surfaces escalation info in DOD_FAILED result', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('gate-attempt-check')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_ckfail',
      type: 'task',
      title: 'check fail task',
      status: 'in_progress',
      priority: 3,
      metadata: { gateAttempts: 1 },
      tags: ['test'],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const envelope = await runCheck('node_ckfail', [])

    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('DOD_FAILED')

    const verifyStore = SqliteStore.open(dir)
    const node = verifyStore.getNodeById('node_ckfail')
    verifyStore.close()
    const attempts = node?.metadata ? getGateAttempts(node.metadata as Record<string, unknown>) : -1
    expect(attempts).toBe(2)
  })
})
