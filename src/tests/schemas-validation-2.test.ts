/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  ThreadStatusSchema,
  TurnStatusSchema,
  UserMessageItemSchema,
  AgentMessageItemSchema,
  CommandExecutionItemSchema,
  FileChangeItemSchema,
  ThreadItemSchema,
  TurnSchema,
  ThreadSchema,
  GitInfoSchema,
  ThreadSourceSchema,
} from '../schemas/app-server-thread.schema.js'
import { AxiomLinkSchema } from '../schemas/axiom-link.schema.js'
import { CommandRiskSchema, ValidationResultSchema } from '../schemas/bash-validation.schema.js'
import {
  HelperOriginSchema,
  HelperSignatureSchema,
  HelperRecordSchema,
  HarnessSessionSchema,
  HarnessActionSchema,
  HarnessGuardrailSchema,
  HarnessRunSchema,
  PlannedStepSchema,
  StepResultSchema,
} from '../schemas/browser-harness.schema.js'
import {
  BrowserPilotInputSchema,
  BrowserPilotOutputSchema,
  BrowserPilotErrorSchema,
  BrowserPilotResponseSchema,
  BROWSER_PILOT_MODELS,
} from '../schemas/browser-pilot.schema.js'

// ── app-server-thread.schema ────────────────────────────────────────────────

describe('ThreadStatusSchema', () => {
  it('accepts literal statuses', () => {
    expect(ThreadStatusSchema.parse('NotLoaded')).toBe('NotLoaded')
    expect(ThreadStatusSchema.parse('Idle')).toBe('Idle')
    expect(ThreadStatusSchema.parse('SystemError')).toBe('SystemError')
  })

  it('accepts Active object', () => {
    const result = ThreadStatusSchema.parse({ Active: { flags: ['f1'] } })
    expect(result).toEqual({ Active: { flags: ['f1'] } })
  })

  it('defaults flags to empty array', () => {
    const result = ThreadStatusSchema.parse({ Active: {} })
    expect(result).toEqual({ Active: { flags: [] } })
  })

  it('rejects invalid value', () => {
    expect(ThreadStatusSchema.safeParse('Invalid').success).toBe(false)
  })

  it('rejects null', () => {
    expect(ThreadStatusSchema.safeParse(null).success).toBe(false)
  })
})

describe('TurnStatusSchema', () => {
  it('accepts all valid statuses', () => {
    for (const s of ['Starting', 'AwaitingInput', 'Running', 'Stopping', 'Stopped', 'Error'] as const) {
      expect(TurnStatusSchema.parse(s)).toBe(s)
    }
  })

  it('rejects unknown status', () => {
    expect(TurnStatusSchema.safeParse('Unknown').success).toBe(false)
  })
})

describe('UserMessageItemSchema', () => {
  it('accepts valid message', () => {
    const data = { type: 'UserMessage' as const, content: 'hello' }
    expect(UserMessageItemSchema.parse(data).content).toBe('hello')
  })

  it('rejects wrong type', () => {
    expect(UserMessageItemSchema.safeParse({ type: 'AgentMessage', content: 'hi' }).success).toBe(false)
  })
})

describe('AgentMessageItemSchema', () => {
  it('accepts with optional fields', () => {
    const data = { type: 'AgentMessage' as const, content: 'hi', model: 'sonnet', timestamp: 100 }
    expect(AgentMessageItemSchema.parse(data).model).toBe('sonnet')
  })
})

describe('CommandExecutionItemSchema', () => {
  it('accepts full command', () => {
    const data = { type: 'CommandExecution' as const, command: 'ls', exitCode: 0, stdout: 'foo' }
    expect(CommandExecutionItemSchema.parse(data).command).toBe('ls')
  })
})

describe('FileChangeItemSchema', () => {
  it('accepts valid change', () => {
    const data = { type: 'FileChange' as const, filePath: '/a/b.ts', changeType: 'edit' as const }
    expect(FileChangeItemSchema.parse(data).filePath).toBe('/a/b.ts')
  })

  it('rejects invalid changeType', () => {
    expect(FileChangeItemSchema.safeParse({ type: 'FileChange', filePath: '/a.ts', changeType: 'chmod' }).success).toBe(
      false,
    )
  })
})

describe('ThreadItemSchema', () => {
  it('accepts any valid variant', () => {
    const items = [
      { type: 'UserMessage' as const, content: 'hello' },
      { type: 'AgentMessage' as const, content: 'world' },
      { type: 'Plan' as const, steps: ['step1'] },
      { type: 'Error' as const, error: 'fail' },
    ]
    for (const item of items) {
      expect(ThreadItemSchema.parse(item).type).toBe(item.type)
    }
  })
})

describe('GitInfoSchema', () => {
  it('accepts empty object', () => {
    expect(GitInfoSchema.parse({})).toEqual({})
  })

  it('accepts full git info', () => {
    const data = { remote: 'origin', branch: 'main', sha: 'abc123', isDirty: false }
    expect(GitInfoSchema.parse(data).sha).toBe('abc123')
  })
})

describe('ThreadSourceSchema', () => {
  it('accepts all sources', () => {
    for (const s of ['user', 'cli', 'api', 'web', 'extension'] as const) {
      expect(ThreadSourceSchema.parse(s)).toBe(s)
    }
  })
})

describe('TurnSchema', () => {
  const valid = { id: 't1', items: [], status: 'Starting' as const }

  it('accepts valid turn', () => {
    expect(TurnSchema.parse(valid).id).toBe('t1')
  })

  it('defaults items to empty array', () => {
    const result = TurnSchema.parse(valid)
    expect(result.items).toEqual([])
  })
})

describe('ThreadSchema', () => {
  const valid = {
    id: 'th1',
    sessionId: 's1',
    status: 'Idle' as const,
  }

  it('accepts minimal thread', () => {
    const result = ThreadSchema.parse(valid)
    expect(result.turns).toEqual([])
  })

  it('accepts full thread', () => {
    const data = { ...valid, cwd: '/home', modelProvider: 'anthropic', source: 'cli' as const }
    expect(ThreadSchema.parse(data).cwd).toBe('/home')
  })

  it('rejects missing id', () => {
    const { id: _, ...rest } = valid
    expect(ThreadSchema.safeParse(rest).success).toBe(false)
  })
})

// ── axiom-link.schema ───────────────────────────────────────────────────────

describe('AxiomLinkSchema', () => {
  const valid = {
    id: 'ax-1',
    constitutionPrincipleId: 'cp-1',
    acceptanceCriteriaIds: ['ac-1'],
    provenanceReceiptId: 'pr-1',
    timestamp: '2026-01-01T12:00:00Z',
  }

  it('accepts valid link', () => {
    const result = AxiomLinkSchema.parse(valid)
    expect(result.id).toBe('ax-1')
    expect(result.revoked).toBe(false)
  })

  it('revoked can be true', () => {
    expect(AxiomLinkSchema.parse({ ...valid, revoked: true }).revoked).toBe(true)
  })

  it('rejects empty acceptanceCriteriaIds', () => {
    expect(AxiomLinkSchema.safeParse({ ...valid, acceptanceCriteriaIds: [] }).success).toBe(false)
  })

  it('rejects non-ISO timestamp', () => {
    expect(AxiomLinkSchema.safeParse({ ...valid, timestamp: 'yesterday' }).success).toBe(false)
  })

  it('rejects missing id', () => {
    const { id: _, ...rest } = valid
    expect(AxiomLinkSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects null', () => {
    expect(AxiomLinkSchema.safeParse(null).success).toBe(false)
  })
})

// ── bash-validation.schema ──────────────────────────────────────────────────

describe('CommandRiskSchema', () => {
  it('accepts all risk levels', () => {
    for (const r of ['safe', 'warn', 'destructive', 'forbidden'] as const) {
      expect(CommandRiskSchema.parse(r)).toBe(r)
    }
  })

  it('rejects unknown', () => {
    expect(CommandRiskSchema.safeParse('unknown').success).toBe(false)
  })
})

describe('ValidationResultSchema', () => {
  it('accepts minimal result', () => {
    const data = { risk: 'safe' as const, reasons: [] }
    expect(ValidationResultSchema.parse(data).risk).toBe('safe')
  })

  it('accepts with sanitized command', () => {
    const data = { risk: 'warn' as const, reasons: ['contains rm'], sanitizedCommand: 'ls' }
    expect(ValidationResultSchema.parse(data).sanitizedCommand).toBe('ls')
  })

  it('rejects missing reasons', () => {
    expect(ValidationResultSchema.safeParse({ risk: 'safe' }).success).toBe(false)
  })
})

// ── browser-harness.schema ──────────────────────────────────────────────────

describe('HelperOriginSchema', () => {
  it('accepts valid origins', () => {
    expect(HelperOriginSchema.parse('builtin')).toBe('builtin')
    expect(HelperOriginSchema.parse('agent')).toBe('agent')
  })
})

describe('HelperSignatureSchema', () => {
  it('accepts empty params', () => {
    const data = { params: [], returns: 'string' }
    expect(HelperSignatureSchema.parse(data).returns).toBe('string')
  })
})

describe('HelperRecordSchema', () => {
  const valid = {
    name: 'click_button',
    version: 1,
    source: 'function click() {}',
    signature: { params: [], returns: 'void' },
    origin: 'builtin' as const,
    createdAt: 100,
    createdBy: null,
  }

  it('accepts valid record', () => {
    expect(HelperRecordSchema.parse(valid).name).toBe('click_button')
  })

  it('rejects invalid name format', () => {
    expect(HelperRecordSchema.safeParse({ ...valid, name: 'CamelCase' }).success).toBe(false)
  })

  it('rejects null source', () => {
    expect(HelperRecordSchema.safeParse({ ...valid, source: '' }).success).toBe(false)
  })

  it('rejects negative version', () => {
    expect(HelperRecordSchema.safeParse({ ...valid, version: -1 }).success).toBe(false)
  })
})

describe('HarnessSessionSchema', () => {
  const valid = {
    id: 's1',
    cdpEndpoint: 'http://localhost:9222',
    pid: 1234,
    status: 'ready' as const,
    startedAt: 100,
    closedAt: null,
  }

  it('accepts valid session', () => {
    expect(HarnessSessionSchema.parse(valid).id).toBe('s1')
  })

  it('rejects non-url endpoint', () => {
    expect(HarnessSessionSchema.safeParse({ ...valid, cdpEndpoint: 'not-a-url' }).success).toBe(false)
  })
})

describe('PlannedStepSchema', () => {
  it('accepts valid step', () => {
    const data = { index: 0, helper: 'navigate', args: { url: 'http://x.com' } }
    expect(PlannedStepSchema.parse(data).helper).toBe('navigate')
  })

  it('defaults args to {}', () => {
    const result = PlannedStepSchema.parse({ index: 0, helper: 'click' })
    expect(result.args).toEqual({})
  })
})

describe('StepResultSchema', () => {
  it('accepts valid result', () => {
    const data = { index: 0, helper: 'click', ok: true, durationMs: 100, screenshotPath: null, error: null }
    expect(StepResultSchema.parse(data).ok).toBe(true)
  })
})

describe('HarnessRunSchema', () => {
  const valid = {
    id: 'r1',
    sessionId: 's1',
    nodeId: null,
    prompt: 'click the button',
    plan: [],
    results: [],
    verdict: 'pass' as const,
    durationMs: 500,
    createdAt: 100,
  }

  it('accepts valid run', () => {
    expect(HarnessRunSchema.parse(valid).id).toBe('r1')
  })
})

describe('HarnessActionSchema', () => {
  it('accepts start action', () => {
    const data = { action: 'start' as const, headless: true }
    expect(HarnessActionSchema.parse(data).action).toBe('start')
  })

  it('accepts stop action', () => {
    const data = { action: 'stop' as const, sessionId: 's1' }
    expect(HarnessActionSchema.parse(data).sessionId).toBe('s1')
  })

  it('rejects missing sessionId on stop', () => {
    expect(HarnessActionSchema.safeParse({ action: 'stop' }).success).toBe(false)
  })
})

describe('HarnessGuardrailSchema', () => {
  it('applies defaults', () => {
    const result = HarnessGuardrailSchema.parse({})
    expect(result.allowedDomains).toEqual(['*'])
    expect(result.forbiddenCdpMethods).toEqual([])
    expect(result.selfHealPolicy.requireTest).toBe(false)
  })

  it('accepts overrides', () => {
    const data = { allowedDomains: ['example.com'], selfHealPolicy: { requireTest: true } }
    const result = HarnessGuardrailSchema.parse(data)
    expect(result.allowedDomains).toEqual(['example.com'])
    expect(result.selfHealPolicy.requireTest).toBe(true)
  })
})

// ── browser-pilot.schema ────────────────────────────────────────────────────

describe('BrowserPilotInputSchema', () => {
  it('accepts minimal input', () => {
    const data = { prompt: 'go to google.com' }
    expect(BrowserPilotInputSchema.parse(data).prompt).toBe('go to google.com')
  })

  it('applies defaults', () => {
    const result = BrowserPilotInputSchema.parse({ prompt: 'test' })
    expect(result.maxSteps).toBe(25)
    expect(result.screenshotMode).toBe('key_steps')
    expect(result.timeoutMs).toBe(180_000)
  })

  it('rejects empty prompt', () => {
    expect(BrowserPilotInputSchema.safeParse({ prompt: '' }).success).toBe(false)
  })

  it('rejects null', () => {
    expect(BrowserPilotInputSchema.safeParse(null).success).toBe(false)
  })
})

describe('BrowserPilotOutputSchema', () => {
  const valid = {
    success: true as const,
    result: 'done',
    actionLog: [],
    screenshots: [],
    tokens: { prompt: 10, completion: 20, total: 30 },
    model: 'gpt-4o',
    durationMs: 1000,
    runId: 'run-1',
  }

  it('accepts valid output', () => {
    expect(BrowserPilotOutputSchema.parse(valid).result).toBe('done')
  })

  it('rejects missing runId', () => {
    const { runId: _, ...rest } = valid
    expect(BrowserPilotOutputSchema.safeParse(rest).success).toBe(false)
  })
})

describe('BrowserPilotErrorSchema', () => {
  it('accepts valid error', () => {
    const data = { success: false as const, error: { code: 'timeout' as const, message: 'timed out', retriable: true } }
    expect(BrowserPilotErrorSchema.parse(data).error.code).toBe('timeout')
  })
})

describe('BrowserPilotResponseSchema', () => {
  it('accepts success response', () => {
    const data = {
      success: true as const,
      result: 'ok',
      actionLog: [],
      screenshots: [],
      tokens: { prompt: 0, completion: 0, total: 0 },
      model: 'gpt-4o',
      durationMs: 0,
      runId: 'r1',
    }
    expect(BrowserPilotResponseSchema.parse(data).success).toBe(true)
  })

  it('accepts error response', () => {
    const data = { success: false as const, error: { code: 'timeout' as const, message: 'fail', retriable: false } }
    expect(BrowserPilotResponseSchema.parse(data).success).toBe(false)
  })

  it('rejects mixed success/error', () => {
    const data = { success: true as const, error: { code: 'timeout' as const, message: 'x', retriable: false } }
    expect(BrowserPilotResponseSchema.safeParse(data).success).toBe(false)
  })
})
