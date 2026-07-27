/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  InjectionRegistry,
  normalizeHistory,
  planModeProvider,
  tddReminderProvider,
  wipReminderProvider,
  createPhaseProvider,
} from '../core/context/dynamic-injection/index.js'

describe('InjectionRegistry', () => {
  let registry: InjectionRegistry

  beforeEach(() => {
    registry = new InjectionRegistry()
  })

  it('starts with no providers', async () => {
    const injections = await registry.getAllInjections([])
    expect(injections).toEqual([])
  })

  it('returns injections from registered providers', async () => {
    registry.register(planModeProvider)
    registry.register(tddReminderProvider)
    const injections = await registry.getAllInjections([])
    expect(injections).toHaveLength(2)
    expect(injections.map((i) => i.type)).toContain('plan-mode')
    expect(injections.map((i) => i.type)).toContain('tdd-reminder')
  })

  it('deduplicates by type across providers', async () => {
    registry.register(planModeProvider)
    registry.register(planModeProvider)
    const injections = await registry.getAllInjections([])
    expect(injections).toHaveLength(1)
  })

  it('unregister removes a provider', async () => {
    registry.register(planModeProvider)
    registry.unregister(planModeProvider)
    const injections = await registry.getAllInjections([])
    expect(injections).toEqual([])
  })
})

describe('pre-built providers', () => {
  it('planModeProvider returns plan-mode injection', async () => {
    const injections = await planModeProvider.getInjections([])
    expect(injections[0].type).toBe('plan-mode')
    expect(injections[0].content).toContain('PLAN MODE')
  })

  it('tddReminderProvider returns tdd-reminder injection', async () => {
    const injections = await tddReminderProvider.getInjections([])
    expect(injections[0].type).toBe('tdd-reminder')
    expect(injections[0].content).toContain('TDD')
  })

  it('wipReminderProvider returns wip-reminder injection', async () => {
    const injections = await wipReminderProvider.getInjections([])
    expect(injections[0].type).toBe('wip-reminder')
    expect(injections[0].content).toContain('WIP=1')
  })

  it('createPhaseProvider returns phase context', async () => {
    const provider = createPhaseProvider()
    const injections = await provider.getInjections([])
    expect(injections[0].type).toBe('phase-context')
    expect(injections[0].content).toContain('unknown')
  })

  it('createPhaseProvider updates phase via onPhaseChanged', async () => {
    const provider = createPhaseProvider()
    provider.onPhaseChanged!('IMPLEMENT')
    const injections = await provider.getInjections([])
    expect(injections[0].content).toContain('IMPLEMENT')
  })
})

describe('normalizeHistory', () => {
  it('merges consecutive user messages', () => {
    const result = normalizeHistory([
      { role: 'user', content: 'hello' },
      { role: 'user', content: 'world' },
      { role: 'assistant', content: 'response' },
    ])
    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('hello\nworld')
  })

  it('preserves non-consecutive user messages', () => {
    const result = normalizeHistory([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ])
    expect(result).toHaveLength(3)
  })

  it('handles empty input', () => {
    expect(normalizeHistory([])).toEqual([])
  })
})
