import { describe, it, expect } from 'vitest'
import { ApprovalPolicySchema, CodeModeSchema, renderTemplate, builtInCodeModes } from '../schemas/code-mode.schema.js'

describe('ApprovalPolicySchema', () => {
  it('accepts valid policies', () => {
    for (const p of ['Never', 'OnFailure', 'OnRequest', 'UnlessTrusted', 'Granular']) {
      expect(ApprovalPolicySchema.safeParse(p).success).toBe(true)
    }
  })

  it('rejects invalid policy', () => {
    expect(ApprovalPolicySchema.safeParse('Always').success).toBe(false)
  })
})

describe('CodeModeSchema', () => {
  it('accepts a valid code mode', () => {
    const result = CodeModeSchema.safeParse({
      id: 'debug',
      name: 'Debug',
      description: 'Debug mode',
      systemPromptTemplate: 'You are in debug mode.',
      allowedTools: ['bash', 'read'],
      approvalPolicy: 'OnRequest',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty id', () => {
    expect(
      CodeModeSchema.safeParse({
        id: '',
        name: 'X',
        description: 'x',
        systemPromptTemplate: 'x',
        allowedTools: [],
        approvalPolicy: 'Never',
      }).success,
    ).toBe(false)
  })
})

describe('renderTemplate', () => {
  it('replaces template variables', () => {
    const out = renderTemplate('Hello {{user}} using {{model}}', { user: 'Alice', model: 'gpt-4' })
    expect(out).toBe('Hello Alice using gpt-4')
  })

  it('leaves unknown variables as-is', () => {
    const out = renderTemplate('Hello {{unknown}}', {})
    expect(out).toBe('Hello {{unknown}}')
  })
})

describe('builtInCodeModes', () => {
  it('contains pair-programming mode', () => {
    expect(builtInCodeModes['pair-programming']).toBeDefined()
  })

  it('each mode passes schema', () => {
    for (const mode of Object.values(builtInCodeModes)) {
      expect(CodeModeSchema.safeParse(mode).success).toBe(true)
    }
  })
})
