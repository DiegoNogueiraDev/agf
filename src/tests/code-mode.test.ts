import { describe, it, expect } from 'vitest'
import { CodeModeSchema, builtInCodeModes, renderTemplate } from '../schemas/code-mode.schema.js'

describe('CodeModeSchema', () => {
  it('should accept valid code mode', () => {
    const result = CodeModeSchema.safeParse({
      id: 'pair-programming',
      name: 'Pair Programming',
      description: 'Collaborative coding mode',
      systemPromptTemplate: 'You are pair programming with {{user}}. Use {{model}}.',
      allowedTools: ['bash', 'read', 'write', 'search', 'grep'],
      approvalPolicy: 'OnRequest',
    })
    expect(result.success).toBe(true)
  })
})

describe('builtInCodeModes', () => {
  it('should define 5 modes', () => {
    expect(Object.keys(builtInCodeModes)).toHaveLength(5)
  })

  it('should include pair-programming', () => {
    expect(builtInCodeModes['pair-programming']).toBeDefined()
    expect(builtInCodeModes['pair-programming'].id).toBe('pair-programming')
  })

  it('should include code-review', () => {
    expect(builtInCodeModes['code-review']).toBeDefined()
    expect(builtInCodeModes['code-review'].allowedTools).not.toContain('bash')
  })

  it('should include plan-only', () => {
    const mode = builtInCodeModes['plan-only']
    expect(mode.allowedTools).not.toContain('write')
    expect(mode.allowedTools).toContain('search')
  })

  it('should include debug', () => {
    expect(builtInCodeModes['debug']).toBeDefined()
  })

  it('should include explain', () => {
    expect(builtInCodeModes['explain']).toBeDefined()
    expect(builtInCodeModes['explain'].allowedTools).not.toContain('bash')
  })
})

describe('renderTemplate', () => {
  it('should substitute variables', () => {
    const result = renderTemplate('Hello {{user}}, cwd={{cwd}}', { user: 'Alice', cwd: '/home/alice' })
    expect(result).toBe('Hello Alice, cwd=/home/alice')
  })

  it('should substitute {{model}} and {{date}}', () => {
    const result = renderTemplate('Model: {{model}}, Date: {{date}}', { model: 'gpt-4', date: '2024-01-01' })
    expect(result).toContain('gpt-4')
    expect(result).toContain('2024-01-01')
  })

  it('should leave unknown variables as-is', () => {
    const result = renderTemplate('{{unknown}}', {})
    expect(result).toBe('{{unknown}}')
  })
})
