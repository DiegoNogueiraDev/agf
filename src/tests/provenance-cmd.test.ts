/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_d6ef95f55247 — `agf provenance` exposes the epistemic ladder as honesty
 * gates (promote/downgrade/hash). Pure/local — no store, no network.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { provenanceCommand } from '../cli/commands/provenance-cmd.js'

interface Envelope {
  ok: boolean
  code?: string
  data?: unknown
}

function lastEnvelope(captured: string[]): Envelope {
  const objs = captured
    .join('')
    .trim()
    .split('\n')
    .filter((l) => l.trim().startsWith('{') && l.includes('"ok"'))
  return JSON.parse(objs[objs.length - 1]) as Envelope
}

async function run(args: string[]): Promise<Envelope> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  const prevExit = process.exitCode
  await provenanceCommand().parseAsync(args, { from: 'user' })
  spy.mockRestore()
  process.exitCode = prevExit
  return lastEnvelope(out)
}

describe('agf provenance command (#node_d6ef95f55247)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('hash --content returns a deterministic local receipt', async () => {
    const env = await run(['hash', '--content', 'hello'])
    expect(env.ok).toBe(true)
    expect((env.data as { receiptId: string }).receiptId).toMatch(/^[0-9a-f]{64}$/)
  })

  it('promote to cited succeeds with a citation', async () => {
    const env = await run(['promote', '--node', 'n1', '--to', 'cited', '--citation', 'c1'])
    expect(env.ok).toBe(true)
    expect((env.data as { tier: string }).tier).toBe('cited')
  })

  it('promote to validated without a test run fails with MISSING_EVIDENCE', async () => {
    const env = await run(['promote', '--node', 'n1', '--to', 'validated'])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('MISSING_EVIDENCE')
  })

  it('downgrade validated → cited records the reversal', async () => {
    const env = await run(['downgrade', '--node', 'n1', '--from', 'validated', '--test-run', 'r1', '--cause', 'flaky'])
    expect(env.ok).toBe(true)
    expect((env.data as { tier: string }).tier).toBe('cited')
  })

  it('mix flags a low-maturity set', async () => {
    const nodes = JSON.stringify([
      { id: 'a', title: 'a', tier: 'claim' },
      { id: 'b', title: 'b', tier: 'claim' },
      { id: 'c', title: 'c', tier: 'proven' },
    ])
    const env = await run(['mix', '--nodes', nodes])
    expect(env.ok).toBe(true)
    expect((env.data as { lowMaturity: boolean }).lowMaturity).toBe(true)
  })
})
