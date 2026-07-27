import { describe, it, expect } from 'vitest'
import { COMMANDS, resolveAlias, parseCommand, runReadCommand } from '../tui/dispatch.js'
import type { CommandPort } from '../tui/dispatch.js'

function makePort(): CommandPort {
  return {
    findNext() {
      return { id: 'n1', title: 'Task 1', reason: 'ready' }
    },
    stats() {
      return { totalNodes: 100, byStatus: { backlog: 30, done: 70 } }
    },
    metrics() {
      return { total: 5000, costUsd: 0.05, calls: 10 }
    },
    getPhase() {
      return 'IMPLEMENT'
    },
    getModel() {
      return 'haiku'
    },
    listSkills() {
      return [{ name: 'graph-heal', desc: 'Self-healing', category: 'cross-cutting' }]
    },
    getSkill(name: string) {
      return name === 'graph-heal' ? { name: 'graph-heal', body: '# graph-heal' } : undefined
    },
    principles() {
      return [{ title: 'TDD', category: 'xp', statement: 'Test first' }]
    },
    providers() {
      return ['copilot', 'openai']
    },
    providerCurrent() {
      return 'copilot'
    },
    providerSet(id: string) {
      return `✓ provider = ${id}`
    },
    providerSetUrl(url: string) {
      return url ? `✓ endpoint = ${url}` : '✓ endpoint limpo'
    },
    quality() {
      return { testScore: 80, logScore: 90, passed: true, totalModules: 10, darkModules: [] }
    },
    getGraphNodes() {
      return []
    },
    cacheStats() {
      return {
        sessionHits: 0,
        sessionMisses: 0,
        sessionSize: 0,
        sessionCapacity: 128,
        sessionEvictions: 0,
        toolCacheHits: 0,
        toolCacheMisses: 0,
        toolCacheInvalidations: 0,
        tokensSavedEstimate: 0,
        costAvoidedUsd: 0,
      }
    },
  }
}

const CORE_COMMANDS = [
  'next',
  'stats',
  'metrics',
  'run',
  'autopilot',
  'check',
  'decompose',
  'phase',
  'model',
  'import-prd',
  'doctor',
  'skills',
  'skill',
  'build',
  'generate-prd',
  'quality',
  'principles',
  'provider',
  'kanban',
  'diff',
  'preset',
  'collaborate',
  'scaffold',
  'constitution',
  'feedback',
  'wizard',
  'surface',
  'workbench',
  'compact',
  'deps',
  'audit',
  'repl',
  'help',
  'quit',
]

const RECENT_ADDITIONS = ['cache-stats', 'graph-navigation']

describe('dispatch-regression: COMMANDS integrity', () => {
  it('has at least 35 commands', () => {
    expect(COMMANDS.length).toBeGreaterThanOrEqual(35)
  })

  it('all core commands are present', () => {
    const names = new Set(COMMANDS.map((c) => c.name))
    for (const cmd of CORE_COMMANDS) {
      expect(names.has(cmd)).toBe(true)
    }
  })

  it('recent additions are present', () => {
    const names = new Set(COMMANDS.map((c) => c.name))
    for (const cmd of RECENT_ADDITIONS) {
      expect(names.has(cmd)).toBe(true)
    }
  })

  it('no duplicate command names', () => {
    const names = COMMANDS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every command has usage and desc', () => {
    for (const cmd of COMMANDS) {
      expect(cmd.usage).toBeTruthy()
      expect(cmd.desc).toBeTruthy()
    }
  })

  it('all built-in commands dispatch without error', () => {
    const port = makePort()
    for (const cmd of CORE_COMMANDS) {
      const result = runReadCommand(port, { cmd, args: '' })
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('unknown command returns help hint', () => {
    const port = makePort()
    const result = runReadCommand(port, { cmd: 'nonexistent', args: '' })
    expect(result).toContain('Comando desconhecido')
    expect(result).toContain('/help')
  })

  it('empty command returns prompt', () => {
    const port = makePort()
    const result = runReadCommand(port, { cmd: '', args: '' })
    expect(result).toContain('/')
  })

  it('alias resolution works for all commands with aliases', () => {
    const commandsWithAliases = COMMANDS.filter((c) => c.aliases?.length)
    for (const cmd of commandsWithAliases) {
      for (const alias of cmd.aliases!) {
        const resolved = resolveAlias(alias, COMMANDS)
        expect(resolved).toBe(cmd.name)
      }
    }
  })
})
