import { describe, it, expect, afterEach, vi } from 'vitest'
import { economyCommand } from '../cli/commands/economy-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('agf economy pipeline (node_wire_83d7ce1c55f2 — economy-pipeline wiring)', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('lists all pipeline stages in canonical order with an enabled flag each', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await economyCommand().parseAsync(['pipeline'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { stages: Array<{ stage: string; enabled: boolean; envFlag: string | null }> }
    expect(data.stages.map((s) => s.stage)).toEqual([
      'booster',
      'cache',
      'tier',
      'batch',
      'tiered',
      'compress',
      'content-router',
      'caveman-input',
      'llm',
    ])
  })

  it('marks a stage disabled when its env flag is set to "off", and llm as always enabled', async () => {
    process.env.ECONOMY_BOOSTER = 'off'

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await economyCommand().parseAsync(['pipeline'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = envelope.data as { stages: Array<{ stage: string; enabled: boolean }> }
    const booster = data.stages.find((s) => s.stage === 'booster')!
    const llm = data.stages.find((s) => s.stage === 'llm')!
    expect(booster.enabled).toBe(false)
    expect(llm.enabled).toBe(true)
  })
})
