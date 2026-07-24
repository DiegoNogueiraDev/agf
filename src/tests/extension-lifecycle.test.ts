import { describe, it, expect, vi } from 'vitest'
import {
  PromptSlotSchema,
  type PromptSlot,
  PromptFragmentSchema,
  type PromptFragment,
  type ConfigContributor,
  type ContextContributor,
  type ToolContributor,
  type ToolLifecycleContributor,
  type TurnLifecycleContributor,
  type ThreadLifecycleContributor,
  type TurnInputContributor,
  ReviewDecision,
  type ApprovalReviewContributor,
  type TurnItemContributor,
  type TurnItem,
  type TokenUsageContributor,
  type TokenUsage,
  type ToolExecutor,
} from '../schemas/extension-lifecycle.schema.js'

describe('PromptSlotSchema', () => {
  it('should validate DeveloperPolicy', () => {
    const result = PromptSlotSchema.safeParse('DeveloperPolicy')
    expect(result.success).toBe(true)
  })

  it('should validate DeveloperCapabilities', () => {
    const result = PromptSlotSchema.safeParse('DeveloperCapabilities')
    expect(result.success).toBe(true)
  })

  it('should validate ContextualUser', () => {
    const result = PromptSlotSchema.safeParse('ContextualUser')
    expect(result.success).toBe(true)
  })

  it('should validate SeparateDeveloper', () => {
    const result = PromptSlotSchema.safeParse('SeparateDeveloper')
    expect(result.success).toBe(true)
  })

  it('should reject invalid slot', () => {
    const result = PromptSlotSchema.safeParse('InvalidSlot')
    expect(result.success).toBe(false)
  })
})

describe('PromptFragmentSchema', () => {
  it('should validate valid fragment', () => {
    const result = PromptFragmentSchema.safeParse({
      slot: 'DeveloperPolicy',
      text: 'Be safe',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priority).toBe(50)
    }
  })

  it('should accept explicit priority', () => {
    const result = PromptFragmentSchema.safeParse({
      slot: 'DeveloperCapabilities',
      text: 'Can edit files',
      priority: 80,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priority).toBe(80)
    }
  })
})

describe('ReviewDecision', () => {
  it('should define Allow', () => {
    expect(ReviewDecision.Allow).toBe('allow')
  })

  it('should define Deny', () => {
    expect(ReviewDecision.Deny).toBe('deny')
  })

  it('should define AskUser', () => {
    expect(ReviewDecision.AskUser).toBe('ask_user')
  })
})

describe('ConfigContributor', () => {
  it('should accept mock implementation', () => {
    const mock: ConfigContributor = {
      onConfigChanged: vi.fn(),
    }
    mock.onConfigChanged({ model: 'gpt-4' }, { model: 'gpt-5' })
    expect(mock.onConfigChanged).toHaveBeenCalled()
  })
})

describe('ContextContributor', () => {
  it('should return prompt fragments', () => {
    const mock: ContextContributor = {
      contribute: vi.fn().mockReturnValue([{ slot: 'DeveloperPolicy' as PromptSlot, text: 'Be safe', priority: 50 }]),
    }
    const fragments = mock.contribute()
    expect(fragments).toHaveLength(1)
    expect(fragments[0]!.slot).toBe('DeveloperPolicy')
  })
})

describe('ToolContributor', () => {
  it('should return tool executors', () => {
    const mock: ToolContributor = {
      tools: vi.fn().mockReturnValue([{ name: 'bash', execute: vi.fn() }]),
    }
    const tools = mock.tools()
    expect(tools).toHaveLength(1)
    expect(tools[0]!.name).toBe('bash')
  })
})

describe('ToolLifecycleContributor', () => {
  it('should have onToolStart and onToolFinish', () => {
    const mock: ToolLifecycleContributor = {
      onToolStart: vi.fn(),
      onToolFinish: vi.fn(),
    }
    mock.onToolStart('bash', { command: 'ls' })
    mock.onToolFinish('bash', { exitCode: 0 })
    expect(mock.onToolStart).toHaveBeenCalledWith('bash', { command: 'ls' })
    expect(mock.onToolFinish).toHaveBeenCalledWith('bash', { exitCode: 0 })
  })
})

describe('TurnLifecycleContributor', () => {
  it('should have lifecycle hooks', () => {
    const mock: TurnLifecycleContributor = {
      onTurnStart: vi.fn(),
      onTurnStop: vi.fn(),
      onTurnAbort: vi.fn(),
      onTurnError: vi.fn(),
    }
    mock.onTurnStart()
    mock.onTurnStop()
    mock.onTurnAbort(new Error('timeout'))
    mock.onTurnError(new Error('failed'))
    expect(mock.onTurnStart).toHaveBeenCalledOnce()
  })
})

describe('ThreadLifecycleContributor', () => {
  it('should have lifecycle hooks', () => {
    const mock: ThreadLifecycleContributor = {
      onThreadStart: vi.fn(),
      onThreadResume: vi.fn(),
      onThreadIdle: vi.fn(),
      onThreadStop: vi.fn(),
    }
    mock.onThreadStart()
    mock.onThreadResume()
    mock.onThreadIdle()
    mock.onThreadStop()
    expect(mock.onThreadStart).toHaveBeenCalledOnce()
  })
})

describe('TurnInputContributor', () => {
  it('should return contextual fragments', () => {
    const mock: TurnInputContributor = {
      contribute: vi
        .fn()
        .mockReturnValue([{ slot: 'ContextualUser' as PromptSlot, text: 'Use TypeScript', priority: 50 }]),
    }
    const fragments = mock.contribute('user input')
    expect(fragments).toHaveLength(1)
    expect(fragments[0]!.text).toBe('Use TypeScript')
  })
})

describe('ApprovalReviewContributor', () => {
  it('should return ReviewDecision', () => {
    const mock: ApprovalReviewContributor = {
      contribute: vi.fn().mockReturnValue(ReviewDecision.Deny),
    }
    const result = mock.contribute('rm -rf /')
    expect(result).toBe(ReviewDecision.Deny)
  })

  it('should return undefined to skip', () => {
    const mock: ApprovalReviewContributor = {
      contribute: vi.fn().mockReturnValue(undefined),
    }
    const result = mock.contribute('ls')
    expect(result).toBeUndefined()
  })
})

describe('TurnItemContributor', () => {
  it('should mutate the item', () => {
    const mock: TurnItemContributor = {
      contribute: vi.fn(),
    }
    const item: TurnItem = { role: 'assistant', content: 'Hello' }
    mock.contribute(item)
    expect(mock.contribute).toHaveBeenCalledWith(item)
  })
})

describe('TokenUsageContributor', () => {
  it('should receive token usage', () => {
    const mock: TokenUsageContributor = {
      onTokenUsage: vi.fn(),
    }
    const usage: TokenUsage = { inputTokens: 100, outputTokens: 50 }
    mock.onTokenUsage(usage)
    expect(mock.onTokenUsage).toHaveBeenCalledWith(usage)
  })
})
