/*!
 * Tests for dispatch-catalog.ts — asserts the 5 critical-loop slash commands exist.
 * AC: brief, submit, gaps, savings, preflight entries are registered in COMMANDS.
 */

import { describe, it, expect } from 'vitest'
import { COMMANDS } from '../tui/dispatch-catalog.js'

const names = COMMANDS.map((c) => c.name)

describe('dispatch-catalog critical loop entries', () => {
  it('registers /brief', () => {
    const cmd = COMMANDS.find((c) => c.name === 'brief')
    expect(cmd).toBeDefined()
    expect(cmd?.usage).toContain('<id>')
    expect(cmd?.desc.length).toBeGreaterThan(5)
  })

  it('registers /submit', () => {
    const cmd = COMMANDS.find((c) => c.name === 'submit')
    expect(cmd).toBeDefined()
    expect(cmd?.usage).toContain('<id>')
  })

  it('registers /gaps', () => {
    expect(names).toContain('gaps')
    const cmd = COMMANDS.find((c) => c.name === 'gaps')!
    expect(cmd.desc.length).toBeGreaterThan(5)
  })

  it('registers /savings', () => {
    expect(names).toContain('savings')
  })

  it('registers /preflight', () => {
    const cmd = COMMANDS.find((c) => c.name === 'preflight')
    expect(cmd).toBeDefined()
    expect(cmd?.usage).toContain('<topic>')
  })
})

// ── node_454fbdf2fa3e — lifecycle slash entries ────────────────────────────────

describe('dispatch-catalog lifecycle entries (node_454fbdf2fa3e)', () => {
  const LIFECYCLE_CMDS = ['spec', 'forecast', 'swarm', 'snapshot', 'template', 'plugin', 'hooks', 'lint-files']

  for (const name of LIFECYCLE_CMDS) {
    it(`registers /${name}`, () => {
      const cmd = COMMANDS.find((c) => c.name === name)
      expect(cmd, `/${name} missing from COMMANDS`).toBeDefined()
      expect(cmd!.desc.length).toBeGreaterThan(5)
    })
  }
})

import { runReadCommand } from '../tui/dispatch-ports.js'
import type { CommandPort } from '../tui/dispatch-ports.js'

function makeMinimalPort(): CommandPort {
  return {
    graph: () => ({ nodes: [], edges: [] }),
    metrics: () => ({ costUsd: 0, tokensIn: 0, tokensOut: 0, calls: 0 }),
    getModel: () => 'auto',
    cacheStats: () => ({ sessionHits: 0, sessionMisses: 0, toolCacheHits: 0, toolCacheMisses: 0 }),
    principles: () => [],
    quality: () => ({ testScore: 0, logScore: 0, totalModules: 0, passed: false, darkModules: [] }),
    insights: () => '',
    gate: () => '',
    learning: () => '',
    heal: () => '',
    economy: () => '',
  } as unknown as CommandPort
}

describe('runReadCommand dispatches lifecycle commands', () => {
  const port = makeMinimalPort()

  for (const name of ['spec', 'forecast', 'swarm', 'snapshot', 'template', 'plugin', 'hooks', 'lint-files']) {
    it(`/${name} returns non-empty string (not "Comando desconhecido")`, () => {
      const result = runReadCommand(port, { cmd: name, args: '' })
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).not.toMatch(/Comando desconhecido/i)
    })
  }
})
