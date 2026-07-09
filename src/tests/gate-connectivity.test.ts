/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_ad254eb9b9c1 — `agf gate connectivity` fails when connectivity
 * < threshold or regresses vs the stored baseline (harness_history).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { gateCommand } from '../cli/commands/gate-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runGateCmd(dir: string, phase = 'connectivity'): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await gateCommand().parseAsync([phase, '-d', dir], { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('agf gate connectivity', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-gate-connectivity-'))
    mkdirSync(join(dir, 'src/core'), { recursive: true })
    mkdirSync(join(dir, 'src/cli'), { recursive: true })
    // A core file WITH a surface import — connected.
    writeFileSync(join(dir, 'src/core/connected.ts'), 'export function connected() {}\n')
    writeFileSync(join(dir, 'src/cli/entry.ts'), "import { connected } from '../core/connected.js'\nconnected()\n")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('fails when connectivity is below threshold, listing dormant modules', async () => {
    // A dormant core file with no surface import.
    writeFileSync(join(dir, 'src/core/dormant.ts'), 'export function dormant() {}\n')

    const store = SqliteStore.open(dir)
    store.initProject('gate-connectivity-test')
    store.close()

    const envelope = await runGateCmd(dir)
    expect(envelope.ok).toBe(false)
    const errorMsg = JSON.stringify(envelope)
    expect(errorMsg).toContain('dormant.ts')
  })

  it('passes when every core file is reachable from a surface', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('gate-connectivity-test')
    store.close()

    const envelope = await runGateCmd(dir)
    expect(envelope.ok).toBe(true)
  })

  it('runs against the real corpus/ (this repository itself, not a synthetic fixture) without crashing', async () => {
    // The fixture-only gate (node_61e14cd0711a) exists precisely because a
    // hand-built fixture proves the happy path, not that a core module
    // survives real input — so this scans agf's OWN src/core against agf's
    // OWN surfaces, the actual corpus, and only asserts the pipeline
    // produces a structurally valid result (the exact score is expected to
    // drift as the codebase evolves, so it is not pinned to a literal number).
    const realRepoRoot = join(import.meta.dirname, '..', '..')

    const envelope = await runGateCmd(realRepoRoot)
    const data = envelope.data as { phases: Array<{ report: { score: number; ready: boolean } }> }
    const connectivityReport = data.phases[0].report
    expect(typeof connectivityReport.score).toBe('number')
    expect(connectivityReport.score).toBeGreaterThan(0)
    expect(connectivityReport.score).toBeLessThanOrEqual(100)
  })
})
