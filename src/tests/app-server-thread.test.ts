import { describe, it, expect } from 'vitest'
import {
  ThreadSchema,
  ThreadStatusSchema,
  TurnSchema,
  TurnStatusSchema,
  ThreadItemSchema,
  UserInputSchema,
  GitInfoSchema,
} from '../schemas/app-server-thread.schema.js'

describe('ThreadStatusSchema', () => {
  it('parse NotLoaded', () => {
    expect(ThreadStatusSchema.parse('NotLoaded')).toBe('NotLoaded')
  })

  it('parse Active with flags', () => {
    const result = ThreadStatusSchema.parse({ Active: { flags: ['running'] } })
    expect(result).toEqual({ Active: { flags: ['running'] } })
  })

  it('default flags vazio quando omitido', () => {
    const result = ThreadStatusSchema.parse({ Active: {} })
    expect(result).toEqual({ Active: { flags: [] } })
  })
})

describe('TurnStatusSchema', () => {
  it('aceita todos os valores', () => {
    const valid = ['Starting', 'AwaitingInput', 'Running', 'Stopping', 'Stopped', 'Error'] as const
    for (const v of valid) {
      expect(TurnStatusSchema.parse(v)).toBe(v)
    }
  })
})

describe('UserInputSchema', () => {
  it('parse Text input', () => {
    const result = UserInputSchema.parse({ Text: 'hello' })
    expect(result).toEqual({ Text: 'hello' })
  })

  it('parse Image input', () => {
    const result = UserInputSchema.parse({ Image: 'data:image/png,...' })
    expect(result).toEqual({ Image: 'data:image/png,...' })
  })

  it('discrimina corretamente Skill', () => {
    const result = UserInputSchema.parse({ Skill: 'graph-heal' })
    expect(result).toEqual({ Skill: 'graph-heal' })
  })
})

describe('GitInfoSchema', () => {
  it('parse com campos opcionais', () => {
    const result = GitInfoSchema.parse({ remote: 'origin', sha: 'abc123' })
    expect(result.remote).toBe('origin')
    expect(result.sha).toBe('abc123')
    expect(result.branch).toBeUndefined()
  })
})

describe('ThreadItemSchema', () => {
  it('parse UserMessage', () => {
    const item = ThreadItemSchema.parse({ type: 'UserMessage', content: 'Hello' })
    expect(item.type).toBe('UserMessage')
  })

  it('parse Plan', () => {
    const item = ThreadItemSchema.parse({ type: 'Plan', steps: ['Step 1', 'Step 2'] })
    expect(item.type).toBe('Plan')
    expect(item.steps).toHaveLength(2)
  })

  it('parse CommandExecution', () => {
    const item = ThreadItemSchema.parse({ type: 'CommandExecution', command: 'npm test', exitCode: 0 })
    expect(item.type).toBe('CommandExecution')
    expect(item.exitCode).toBe(0)
  })

  it('parse FileChange (create)', () => {
    const item = ThreadItemSchema.parse({ type: 'FileChange', filePath: 'src/a.ts', changeType: 'create' })
    expect(item.changeType).toBe('create')
  })

  it('parse McpToolCall', () => {
    const item = ThreadItemSchema.parse({ type: 'McpToolCall', toolName: 'search' })
    expect(item.toolName).toBe('search')
  })

  it('parse Error', () => {
    const item = ThreadItemSchema.parse({ type: 'Error', error: 'Something failed' })
    expect(item.error).toBe('Something failed')
  })

  it('parse ToolUse', () => {
    const item = ThreadItemSchema.parse({ type: 'ToolUse', toolName: 'bash', input: { cmd: 'ls' } })
    expect(item.type).toBe('ToolUse')
    expect(item.toolName).toBe('bash')
  })

  it('parse WebFetch', () => {
    const item = ThreadItemSchema.parse({ type: 'WebFetch', url: 'https://example.com' })
    expect(item.url).toBe('https://example.com')
  })

  it('rejeita type desconhecido', () => {
    expect(() => ThreadItemSchema.parse({ type: 'Unknown' })).toThrow()
  })
})

describe('TurnSchema', () => {
  it('parse turn basico', () => {
    const turn = TurnSchema.parse({ id: 'turn-1', status: 'Running' })
    expect(turn.id).toBe('turn-1')
    expect(turn.items).toEqual([])
    expect(turn.status).toBe('Running')
  })

  it('parse turn com items', () => {
    const turn = TurnSchema.parse({
      id: 'turn-1',
      status: 'Running',
      items: [
        { type: 'UserMessage', content: 'Hello' },
        { type: 'AgentMessage', content: 'Hi' },
      ],
    })
    expect(turn.items).toHaveLength(2)
  })
})

describe('ThreadSchema', () => {
  it('parse thread completa', () => {
    const thread = ThreadSchema.parse({
      id: 'thread-1',
      sessionId: 'session-1',
      status: 'Idle',
    })
    expect(thread.id).toBe('thread-1')
    expect(thread.turns).toEqual([])
  })

  it('parse thread com Active status', () => {
    const thread = ThreadSchema.parse({
      id: 'thread-1',
      sessionId: 'session-1',
      status: { Active: { flags: ['running'] } },
      cwd: '/home/project',
      source: 'cli',
    })
    expect(thread.status).toEqual({ Active: { flags: ['running'] } })
    expect(thread.cwd).toBe('/home/project')
    expect(thread.source).toBe('cli')
  })

  it('parse com gitInfo', () => {
    const thread = ThreadSchema.parse({
      id: 't1',
      sessionId: 's1',
      status: 'Idle',
      gitInfo: { remote: 'origin', sha: 'abc', isDirty: false },
    })
    expect(thread.gitInfo?.sha).toBe('abc')
  })
})
