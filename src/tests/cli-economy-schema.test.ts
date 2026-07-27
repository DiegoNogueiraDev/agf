import { describe, it, expect, vi } from 'vitest'
import { economyCommand } from '../cli/commands/economy-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runSchema(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await economyCommand().parseAsync(['schema', ...args], { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('agf economy schema (node_wire_340fda6e37e6 — economy-types wiring)', () => {
  it('lists all known economy-types schema names when called with no argument', async () => {
    const envelope = await runSchema([])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { schemas: string[] }
    expect(data.schemas).toEqual(
      expect.arrayContaining([
        'economy-tier',
        'cache-key',
        'cache-entry',
        'tier-distribution',
        'economy-stats',
        'complexity-class',
      ]),
    )
  })

  it('returns a JSON Schema for a known schema name derived from the real Zod schema', async () => {
    const envelope = await runSchema(['cache-key'])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { name: string; jsonSchema: Record<string, unknown> }
    expect(data.name).toBe('cache-key')
    expect(data.jsonSchema.type).toBe('object')
    const properties = data.jsonSchema.properties as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(expect.arrayContaining(['toolName', 'argsHash', 'schemaVersion', 'model']))
  })

  it('returns UNKNOWN_SCHEMA (not a crash) for an unrecognized schema name', async () => {
    const envelope = await runSchema(['not-a-real-schema'])
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('UNKNOWN_SCHEMA')
  })
})
