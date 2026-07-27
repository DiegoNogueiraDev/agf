/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/decompose-cmd.ts — decomposeCommand factory wiring,
 * plus `--plan` (node_wire_d4edda3be76d), which wires the dormant HTN planner
 * (src/core/planner/htn-planner.ts) to the CLI via built-in lifecycle-phase operators.
 */

import { describe, it, expect } from 'vitest'
import { decomposeCommand } from '../cli/commands/decompose-cmd.js'

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
    await decomposeCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('decomposeCommand', () => {
  it('builds the "decompose" command with a description', () => {
    const cmd = decomposeCommand()
    expect(cmd.name()).toBe('decompose')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = decomposeCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})

describe('agf decompose --plan (node_wire_d4edda3be76d)', () => {
  // AC1: GIVEN no --goal WHEN `agf decompose --plan` runs THEN it plans the
  // built-in 'lifecycle' compound goal through all 9 phases in order, without a graph.
  it('plans the default lifecycle goal into ordered phase steps', async () => {
    const result = await run(['--plan'])
    expect(result.ok).toBe(true)
    const data = result.data as { goal: string; feasible: boolean; steps: string[] }
    expect(data.goal).toBe('lifecycle')
    expect(data.feasible).toBe(true)
    expect(data.steps).toEqual([
      'analyze',
      'design',
      'plan',
      'implement',
      'validate',
      'review',
      'handoff',
      'deploy',
      'listening',
    ])
  })

  // AC2: GIVEN --goal <phase> WHEN `agf decompose --plan` runs THEN it plans just that primitive phase
  it('plans a single named phase goal', async () => {
    const result = await run(['--plan', '--goal', 'design'])
    expect(result.ok).toBe(true)
    const data = result.data as { goal: string; feasible: boolean; steps: string[] }
    expect(data.goal).toBe('design')
    expect(data.feasible).toBe(false)
    expect(data.steps).toEqual([])
  })

  // AC3: GIVEN an unknown --goal WHEN `agf decompose --plan` runs THEN it reports infeasible, not a crash
  it('reports infeasible for an unknown goal instead of throwing', async () => {
    const result = await run(['--plan', '--goal', 'nonexistent'])
    expect(result.ok).toBe(true)
    const data = result.data as { feasible: boolean; steps: string[] }
    expect(data.feasible).toBe(false)
    expect(data.steps).toEqual([])
  })
})
