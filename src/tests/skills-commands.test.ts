import { describe, it, expect } from 'vitest'
import { COMMANDS, filterCommands, fuzzyFilter, type SlashCommand } from '../tui/dispatch.js'
import { createDefaultRegistry } from '../tui/skill-registry.js'

const SKILL_NAMES = [
  'graph-analyze',
  'graph-prd',
  'graph-design',
  'graph-plan',
  'graph-implement',
  'graph-bugs',
  'graph-validate',
  'graph-platform',
  'graph-review',
  'graph-security',
  'graph-quality',
  'graph-handoff',
  'graph-deploy',
  'graph-listening',
  'graph-heal',
  'browser',
]

describe('Skills como built-in commands', () => {
  it('COMMANDS[] contém 16 skills com source:skill + graph-navigation como cmd', () => {
    const skillCommands = COMMANDS.filter((c) => c.source === 'skill')
    expect(skillCommands.length).toBe(16)
    for (const s of skillCommands) {
      expect(SKILL_NAMES).toContain(s.name)
    }
    const nav = COMMANDS.find((c) => c.name === 'graph-navigation')
    expect(nav).toBeDefined()
    expect(nav!.source).toBe('cmd')
  })

  it('cada skill está no COMMANDS[] com nome game- ao prefixo /graph-', () => {
    for (const name of SKILL_NAMES) {
      const found = COMMANDS.find((c) => c.name === name)
      expect(found).toBeDefined()
      expect(found!.source).toBe('skill')
      expect(found!.usage).toContain(name)
    }
  })

  it('fuzzyFilter encontra skill por /graph- prefixo', () => {
    const results = fuzzyFilter('graph-heal', COMMANDS)
    expect(results.some((c) => c.name === 'graph-heal')).toBe(true)
  })

  it('filterCommands(/graph-) retorna skills que casam com prefixo', () => {
    const results = filterCommands('/graph-a', COMMANDS)
    const names = results.map((c) => c.name)
    expect(names).toContain('graph-analyze')
    expect(names).toContain('graph-heal') // fuzzy: 'graph-a' é subsequência de 'graph-heal'
  })

  it('35 comandos originais + 16 novos existem no COMMANDS[]', () => {
    const cmdCount = COMMANDS.length
    expect(cmdCount).toBeGreaterThanOrEqual(51) // 35 build-in + 15 skills + 1 graph-navigation + algorithm commands
  })
})

describe('SkillRegistry inclui skills como built-ins', () => {
  it('createDefaultRegistry registra as 16 skills', () => {
    const registry = createDefaultRegistry()
    for (const name of SKILL_NAMES) {
      const found = registry.find(name)
      expect(found).toBeDefined()
      expect(found!.phase).toBeDefined()
    }
  })

  it('registry.getAll() retorna comandos built-in + skills', () => {
    const registry = createDefaultRegistry()
    const all = registry.getAll()
    const skillCount = all.filter((s) => SKILL_NAMES.includes(s.name)).length
    expect(skillCount).toBe(16)
  })
})
