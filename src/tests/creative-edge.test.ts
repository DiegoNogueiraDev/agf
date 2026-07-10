/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_96454cca4eea AC coverage: creative-edge.ts
 *
 * AC1: creativeGate: allowed=false when disabled via env/setting
 * AC2: creativeGate: allowed=true when lambda < saturation (explore)
 * AC3: generateCreativeFiles: returns [] on generator error
 * AC4: generateCreativeFiles: returns parsed files on valid JSON response
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { creativeGate, generateCreativeFiles } from '../core/scaffolder/creative-edge.js'

// ── store mock ────────────────────────────────────────────────────────────────

function makeStore(settings: Record<string, string> = {}) {
  return {
    getProjectSetting: (key: string) => settings[key] ?? null,
    setProjectSetting: (_k: string, _v: string) => undefined,
  } as never
}

const NODE = { title: 'Auth service', description: 'JWT authentication' }
const GAP = ['validate tokens', 'refresh flow']

// ── creativeGate ──────────────────────────────────────────────────────────────

describe('creativeGate', () => {
  beforeEach(() => {
    delete process.env.AGF_CREATIVE
  })

  afterEach(() => {
    delete process.env.AGF_CREATIVE
  })

  it('AC1: allowed=false when AGF_CREATIVE=0 env var set', () => {
    process.env.AGF_CREATIVE = '0'
    const result = creativeGate(makeStore())
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('disabled')
  })

  it('AC1: allowed=false when creative_disabled=true in settings', () => {
    const result = creativeGate(makeStore({ creative_disabled: 'true' }))
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('disabled')
  })

  it('AC1: allowed=false when lambda >= saturation (flow-saturated)', () => {
    // phi=1.0 → lambda=0.15 + 1.5*1.0 = 1.65 >= default saturation 0.6
    const result = creativeGate(makeStore({ flow_phi: '1.0' }))
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/flow-saturated/)
  })

  it('AC2: allowed=true when phi=0 (lambda=0.15 < saturation=0.6)', () => {
    const result = creativeGate(makeStore({ flow_phi: '0' }))
    expect(result.allowed).toBe(true)
    expect(result.reason).toMatch(/explore/)
  })

  it('AC2: lambda is returned in result', () => {
    const result = creativeGate(makeStore({ flow_phi: '0' }))
    expect(typeof result.lambda).toBe('number')
    expect(result.lambda).toBeCloseTo(0.15, 5) // 0.15 + 1.5 * 0
  })

  it('AC2: respects custom saturation from settings', () => {
    // phi=0 → lambda=0.15; saturation=0.1 → lambda >= saturation → saturated
    const result = creativeGate(makeStore({ flow_phi: '0', creative_saturation: '0.1' }))
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/flow-saturated/)
  })

  it('AC2: AGF_CREATIVE=1 does not disable', () => {
    process.env.AGF_CREATIVE = '1'
    const result = creativeGate(makeStore({ flow_phi: '0' }))
    expect(result.allowed).toBe(true)
  })
})

// ── generateCreativeFiles ─────────────────────────────────────────────────────

describe('generateCreativeFiles', () => {
  it('AC3: returns [] when generator throws', async () => {
    const gen = vi.fn().mockRejectedValue(new Error('LLM timeout'))
    const result = await generateCreativeFiles(NODE, GAP, gen)
    expect(result).toEqual([])
  })

  it('AC3: returns [] when generator returns invalid JSON', async () => {
    const gen = vi.fn().mockResolvedValue('not valid json at all')
    const result = await generateCreativeFiles(NODE, GAP, gen)
    expect(result).toEqual([])
  })

  it('AC3: returns [] when JSON lacks files or edits (invalid plan shape)', async () => {
    const gen = vi.fn().mockResolvedValue('```json\n{"foo":"bar"}\n```')
    const result = await generateCreativeFiles(NODE, GAP, gen)
    expect(result).toEqual([])
  })

  it('AC4: returns files parsed from valid JSON plan', async () => {
    const plan = {
      files: [{ path: 'src/auth.ts', content: 'export const auth = {}' }],
    }
    const gen = vi.fn().mockResolvedValue(`\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``)
    const result = await generateCreativeFiles(NODE, GAP, gen)
    expect(result).toHaveLength(1)
    expect(result[0]!.path).toBe('src/auth.ts')
    expect(result[0]!.content).toBe('export const auth = {}')
  })

  it('AC4: returns multiple files from multi-file plan', async () => {
    const plan = {
      files: [
        { path: 'src/a.ts', content: 'export const a = 1' },
        { path: 'src/b.ts', content: 'export const b = 2' },
      ],
    }
    const gen = vi.fn().mockResolvedValue(`\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``)
    const result = await generateCreativeFiles(NODE, GAP, gen)
    expect(result).toHaveLength(2)
  })

  it('AC4: generator is called once per invocation', async () => {
    const plan = { files: [{ path: 'x.ts', content: '' }] }
    const gen = vi.fn().mockResolvedValue(`\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``)
    await generateCreativeFiles(NODE, GAP, gen)
    expect(gen).toHaveBeenCalledOnce()
  })

  it('AC4: empty gap produces a prompt mentioning node title', async () => {
    const plan = { files: [{ path: 'x.ts', content: '' }] }
    const gen = vi.fn().mockResolvedValue(`\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``)
    await generateCreativeFiles(NODE, [], gen)
    const promptArg: string = gen.mock.calls[0]![0] as string
    expect(promptArg).toContain('Auth service')
  })
})
