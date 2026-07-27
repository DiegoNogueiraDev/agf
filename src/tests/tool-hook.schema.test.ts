import { describe, it, expect } from 'vitest'
import { ToolHookEventSchema, ToolHookConfigSchema, HookResultSchema } from '../schemas/tool-hook.schema.js'

describe('ToolHookEventSchema', () => {
  it('accepts valid events', () => {
    for (const ev of ['PreToolUse', 'PostToolUse', 'PostToolUseFailure']) {
      expect(ToolHookEventSchema.safeParse(ev).success).toBe(true)
    }
  })

  it('rejects unknown event', () => {
    expect(ToolHookEventSchema.safeParse('OnError').success).toBe(false)
  })
})

describe('ToolHookConfigSchema', () => {
  it('accepts a valid hook config', () => {
    const result = ToolHookConfigSchema.safeParse({
      tool: 'bash',
      event: 'PreToolUse',
      command: 'echo $TOOL_INPUT | jq .',
    })
    expect(result.success).toBe(true)
  })

  it('defaults timeoutMs to 5000', () => {
    const result = ToolHookConfigSchema.safeParse({
      tool: '*',
      event: 'PostToolUse',
      command: 'audit.sh',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.timeoutMs).toBe(5000)
  })

  it('accepts wildcard tool name', () => {
    expect(
      ToolHookConfigSchema.safeParse({
        tool: '*',
        event: 'PostToolUseFailure',
        command: 'log-failure.sh',
      }).success,
    ).toBe(true)
  })
})

describe('HookResultSchema', () => {
  it('accepts allow=true', () => {
    expect(HookResultSchema.safeParse({ allow: true }).success).toBe(true)
  })

  it('accepts allow=false with warnings', () => {
    const result = HookResultSchema.safeParse({ allow: false, warnings: ['Blocked'] })
    expect(result.success).toBe(true)
  })

  it('rejects missing allow field', () => {
    expect(HookResultSchema.safeParse({}).success).toBe(false)
  })
})
