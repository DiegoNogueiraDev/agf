/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  HookTimeoutError,
  HookCircuitOpenError,
  UnknownHookChannelError,
  HOOK_CHANNELS,
  HOOK_TAXONOMY,
  HOOK_TAXONOMY_POINTS,
  HookChannelSchema,
  HookEventSchema,
  HookRegistrationSchema,
  assertHookChannel,
  resolveHookChannel,
} from '../core/hooks/hook-types.js'

describe('HookTimeoutError', () => {
  it('creates error with correct message and properties', () => {
    const err = new HookTimeoutError('handler-1', 500)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('HookTimeoutError')
    expect(err.handlerId).toBe('handler-1')
    expect(err.timeoutMs).toBe(500)
    expect(err.message).toContain('handler-1')
    expect(err.message).toContain('500')
  })
})

describe('HookCircuitOpenError', () => {
  it('creates error with correct message and properties', () => {
    const err = new HookCircuitOpenError('handler-1')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('HookCircuitOpenError')
    expect(err.handlerId).toBe('handler-1')
    expect(err.message).toContain('handler-1')
    expect(err.message).toContain('disabled')
  })
})

describe('HOOK_CHANNELS', () => {
  it('contains all expected channels', () => {
    expect(HOOK_CHANNELS).toContain('session:start')
    expect(HOOK_CHANNELS).toContain('session:end')
    expect(HOOK_CHANNELS).toContain('agent:pre-spawn')
    expect(HOOK_CHANNELS).toContain('agent:post-spawn')
    expect(HOOK_CHANNELS).toContain('task:pre-execute')
    expect(HOOK_CHANNELS).toContain('task:post-complete')
    expect(HOOK_CHANNELS).toContain('task:error')
    expect(HOOK_CHANNELS).toContain('tool:pre-call')
    expect(HOOK_CHANNELS).toContain('tool:post-call')
    expect(HOOK_CHANNELS).toContain('memory:pre-store')
    expect(HOOK_CHANNELS).toContain('memory:post-store')
    expect(HOOK_CHANNELS).toContain('swarm:consensus-reached')
    expect(HOOK_CHANNELS).toContain('approval:required')
  })

  it('includes A2A direct communication channels', () => {
    expect(HOOK_CHANNELS).toContain('agent:p2p-send')
    expect(HOOK_CHANNELS).toContain('agent:p2p-receive')
    expect(HOOK_CHANNELS).toContain('agent:p2p-ack')
  })
})

describe('HOOK_TAXONOMY — 28-point lifecycle surface', () => {
  // Os 5 pontos que REUSAM canais já existentes (não duplicar).
  const REUSED: Record<string, string> = {
    pre_task_start: 'task:pre-execute',
    pre_tool_execute: 'tool:pre-call',
    post_tool_execute: 'tool:post-call',
    post_task_done: 'task:post-complete',
    on_task_fail: 'task:error',
  }

  // Os 16 canais originais que NÃO podem desaparecer (enum aditivo).
  const ORIGINAL_CHANNELS = [
    'session:start',
    'session:end',
    'agent:pre-spawn',
    'agent:post-spawn',
    'task:pre-execute',
    'task:post-complete',
    'task:error',
    'scaffold:requested',
    'tool:pre-call',
    'tool:post-call',
    'memory:pre-store',
    'memory:post-store',
    'swarm:consensus-reached',
    'approval:required',
    'agent:p2p-send',
    'agent:p2p-receive',
    'agent:p2p-ack',
  ]

  it('defines exactly 29 taxonomy points', () => {
    expect(HOOK_TAXONOMY_POINTS).toHaveLength(29)
    expect(Object.keys(HOOK_TAXONOMY)).toHaveLength(29)
  })

  it('resolves every point to a channel present in HOOK_CHANNELS', () => {
    for (const point of HOOK_TAXONOMY_POINTS) {
      const channel = resolveHookChannel(point)
      expect(HOOK_CHANNELS).toContain(channel)
    }
  })

  it('reuses existing channels for the 5 overlapping points (no duplicate channel)', () => {
    for (const [point, channel] of Object.entries(REUSED)) {
      expect(HOOK_TAXONOMY[point as keyof typeof HOOK_TAXONOMY]).toBe(channel)
    }
  })

  it('contains no duplicate channels in HOOK_CHANNELS', () => {
    expect(new Set(HOOK_CHANNELS).size).toBe(HOOK_CHANNELS.length)
  })

  it('is additive — all 16 original channels remain', () => {
    for (const c of ORIGINAL_CHANNELS) {
      expect(HOOK_CHANNELS).toContain(c)
    }
  })
})

describe('resolveHookChannel / assertHookChannel — typed errors', () => {
  it('resolveHookChannel returns the mapped channel for a known point', () => {
    expect(resolveHookChannel('pre_llm_call')).toBe('llm:pre-call')
    expect(resolveHookChannel('on_budget_warning')).toBe('budget:warning')
  })

  it('resolveHookChannel throws a typed UnknownHookChannelError for an unknown point', () => {
    // @ts-expect-error — ponto inexistente é erro de tipo em compile-time
    expect(() => resolveHookChannel('nope_unknown')).toThrow(UnknownHookChannelError)
  })

  it('assertHookChannel returns the channel when valid', () => {
    expect(assertHookChannel('llm:pre-call')).toBe('llm:pre-call')
  })

  it('assertHookChannel throws a typed UnknownHookChannelError (never a raw string) for unknown channel', () => {
    expect(() => assertHookChannel('does:not-exist')).toThrow(UnknownHookChannelError)
    try {
      assertHookChannel('does:not-exist')
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownHookChannelError)
      expect((e as UnknownHookChannelError).channel).toBe('does:not-exist')
    }
  })
})

describe('HookChannelSchema', () => {
  it('accepts valid channel strings', () => {
    expect(HookChannelSchema.parse('session:start')).toBe('session:start')
    expect(HookChannelSchema.parse('tool:pre-call')).toBe('tool:pre-call')
    expect(HookChannelSchema.parse('approval:required')).toBe('approval:required')
  })

  it('rejects invalid channel strings', () => {
    expect(() => HookChannelSchema.parse('invalid-channel')).toThrow()
    expect(() => HookChannelSchema.parse('')).toThrow()
    expect(() => HookChannelSchema.parse(123)).toThrow()
  })
})

describe('HookEventSchema', () => {
  it('accepts valid event objects', () => {
    const event = {
      channel: 'session:start',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { key: 'value' },
    }
    expect(() => HookEventSchema.parse(event)).not.toThrow()
  })

  it('rejects event with missing channel', () => {
    expect(() => HookEventSchema.parse({ timestamp: '2026-01-01T00:00:00.000Z', payload: {} })).toThrow()
  })

  it('rejects event with invalid channel', () => {
    expect(() =>
      HookEventSchema.parse({
        channel: 'bad',
        timestamp: '2026-01-01T00:00:00.000Z',
        payload: {},
      }),
    ).toThrow()
  })

  it('rejects event with missing timestamp', () => {
    expect(() => HookEventSchema.parse({ channel: 'session:start', payload: {} })).toThrow()
  })

  it('accepts event with empty payload', () => {
    const event = {
      channel: 'session:start',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: {},
    }
    const parsed = HookEventSchema.parse(event)
    expect(parsed.payload).toEqual({})
  })
})

describe('HookRegistrationSchema', () => {
  it('accepts valid registration', () => {
    const reg = {
      id: 'my-handler',
      channel: 'session:start',
      handler: async () => {},
      priority: 5,
    }
    const parsed = HookRegistrationSchema.parse(reg)
    expect(parsed.id).toBe('my-handler')
    expect(parsed.channel).toBe('session:start')
    expect(parsed.priority).toBe(5)
  })

  it('defaults priority to 0', () => {
    const reg = {
      id: 'my-handler',
      channel: 'session:start',
      handler: async () => {},
    }
    const parsed = HookRegistrationSchema.parse(reg)
    expect(parsed.priority).toBe(0)
  })

  it('rejects registration with empty id', () => {
    expect(() =>
      HookRegistrationSchema.parse({
        id: '',
        channel: 'session:start',
        handler: async () => {},
      }),
    ).toThrow()
  })

  it('rejects registration with non-async handler', () => {
    expect(() =>
      HookRegistrationSchema.parse({
        id: 'h',
        channel: 'session:start',
        handler: () => {},
      }),
    ).toThrow()
  })
})
