/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/scenario-cmd.ts — surfaces ScenarioRunner
 * (previously dormant) as `agf scenario`, running the built-in self-check
 * suite (builtin-scenarios.ts) against a real :memory: SQLite DB.
 */

import { describe, it, expect } from 'vitest'
import { scenarioCommand } from '../cli/commands/scenario-cmd.js'

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await scenarioCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('scenarioCommand', () => {
  it('builds the "scenario" command with a description', () => {
    const cmd = scenarioCommand()
    expect(cmd.name()).toBe('scenario')
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('runs all built-in scenarios and reports them as passed', async () => {
    const result = await run([])
    expect(result.ok).toBe(true)
    const data = result.data as { results: Array<{ name: string; passed: boolean }>; passed: number; failed: number }
    expect(data.results.length).toBeGreaterThan(0)
    expect(data.failed).toBe(0)
    expect(data.passed).toBe(data.results.length)
    expect(data.results.every((r) => r.passed)).toBe(true)
  })

  it('--name filters to a single scenario by exact name', async () => {
    const result = await run(['--name', 'done-task-requires-status-transition'])
    expect(result.ok).toBe(true)
    const data = result.data as { results: Array<{ name: string }> }
    expect(data.results).toHaveLength(1)
    expect(data.results[0]?.name).toBe('done-task-requires-status-transition')
  })

  it('--name with an unknown name returns NOT_FOUND', async () => {
    const result = await run(['--name', 'does-not-exist'])
    expect(result.ok).toBe(false)
    expect(result.code).toBe('NOT_FOUND')
  })
})

// node_a0e28320fe6b — a flag que liga o run à task de superfície. Sem ela o
// comportamento (e o envelope) permanece idêntico ao anterior: nenhum store aberto.
describe('agf scenario --node (surface-proof persistence)', () => {
  it('expõe a flag --node para associar o run a uma task', () => {
    const cmd = scenarioCommand()
    expect(cmd.options.some((o) => o.long === '--node')).toBe(true)
  })

  it('mantém --name e adiciona --dir sem remover opções existentes', () => {
    const longs = scenarioCommand().options.map((o) => o.long)
    expect(longs).toContain('--name')
    expect(longs).toContain('--dir')
  })
})
