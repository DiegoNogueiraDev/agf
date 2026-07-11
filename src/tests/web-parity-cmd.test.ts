/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/web-parity-cmd.ts — wires auditWebParity
 * (node_wire_7a3681f28454), a pure gap report between CLI capabilities and
 * web dashboard views that had no caller (src/core/web/web-surface-parity.ts).
 */
import { describe, it, expect } from 'vitest'
import { webParityCommand } from '../cli/commands/web-parity-cmd.js'

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
    await webParityCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf web-parity (node_wire_7a3681f28454)', () => {
  // AC1: GIVEN the CLI WHEN `agf web-parity` runs THEN it lists CLI capabilities missing a web view
  it('returns gaps sorted by priority ascending', async () => {
    const result = await run([])
    expect(result.ok).toBe(true)
    const data = result.data as { covered: string[]; gaps: Array<{ capability: string; priority: number }> }
    expect(data.gaps.length).toBeGreaterThan(0)
    for (let i = 1; i < data.gaps.length; i++) {
      expect(data.gaps[i]!.priority).toBeGreaterThanOrEqual(data.gaps[i - 1]!.priority)
    }
  })

  // AC2: GIVEN the report WHEN read THEN covered web surfaces are listed separately from gaps
  it('lists covered web surfaces separately from gaps', async () => {
    const result = await run([])
    const data = result.data as { covered: string[] }
    expect(data.covered).toContain('economy')
    expect(data.covered).toContain('graph')
  })
})
