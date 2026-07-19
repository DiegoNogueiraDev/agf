import { describe, it, expect } from 'vitest'
import type { SkillStep, SkillHandlerPort, SlashCommandSkill } from '../tui/skill-handler-port.js'

describe('SkillStep shape', () => {
  it('satisfies the expected shape', () => {
    const step: SkillStep = { step: 1, total: 3, label: 'init', elapsedMs: 120, tokensUsed: 50 }
    expect(step.step).toBe(1)
    expect(step.total).toBe(3)
    expect(step.label).toBe('init')
    expect(step.elapsedMs).toBe(120)
    expect(step.tokensUsed).toBe(50)
  })
})

describe('SkillHandlerPort contract', () => {
  it('can be implemented inline', async () => {
    const handler: SkillHandlerPort = {
      execute: async (_args, _ctx) => 'done',
    }
    const result = await handler.execute('', {} as never)
    expect(result).toBe('done')
  })

  it('receives args in execute', async () => {
    let received = ''
    const handler: SkillHandlerPort = {
      execute: async (args, _ctx) => {
        received = args
        return 'ok'
      },
    }
    await handler.execute('test-arg', {} as never)
    expect(received).toBe('test-arg')
  })
})

describe('SlashCommandSkill shape', () => {
  it('satisfies required fields', () => {
    const skill: SlashCommandSkill = {
      name: 'graph-implement',
      usage: '/graph-implement <task>',
      desc: 'Execute a task from the graph',
      phase: 'IMPLEMENT',
    }
    expect(skill.name).toBe('graph-implement')
    expect(skill.phase).toBe('IMPLEMENT')
    expect(skill.handler).toBeUndefined()
    expect(skill.dependsOn).toBeUndefined()
  })

  it('accepts optional handler and dependsOn', () => {
    const handler: SkillHandlerPort = { execute: async () => 'ok' }
    const skill: SlashCommandSkill = {
      name: 'test',
      usage: '/test',
      desc: 'Test skill',
      phase: 'VALIDATE',
      handler,
      dependsOn: ['graph-implement'],
    }
    expect(skill.handler).toBeDefined()
    expect(skill.dependsOn).toEqual(['graph-implement'])
  })
})
