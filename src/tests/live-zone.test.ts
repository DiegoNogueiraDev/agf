/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { getLiveZone } from '../core/economy/live-zone.js'

describe('getLiveZone', () => {
  it('marks last user+assistant messages as live', () => {
    const msgs = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'what is this code' },
    ]
    const zone = getLiveZone(msgs)
    expect(zone.frozenEnd).toBe(2) // first 2 messages frozen
    expect(zone.liveStart).toBe(2) // last message is live
  })

  it('all messages live when only one turn', () => {
    const msgs = [{ role: 'user', content: 'hi' }]
    const zone = getLiveZone(msgs)
    expect(zone.frozenEnd).toBe(0)
    expect(zone.liveStart).toBe(0)
  })

  it('empty messages return empty zone', () => {
    const zone = getLiveZone([])
    expect(zone.frozenEnd).toBe(0)
    expect(zone.liveStart).toBe(0)
  })

  it('tool messages after last assistant are still live', () => {
    const msgs = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello', tool_calls: [{ id: 'tc1' }] },
      { role: 'tool', content: 'result', tool_call_id: 'tc1' },
    ]
    const zone = getLiveZone(msgs)
    expect(zone.frozenEnd).toBe(0) // only user is at index 0 (first turn)
    expect(zone.liveStart).toBe(0) // everything from user message on is live
  })

  it('Claude format with content blocks', () => {
    const msgs = [
      { role: 'user', content: [{ type: 'text', text: 'first turn' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'response' }] },
      { role: 'user', content: [{ type: 'text', text: 'second turn' }] },
    ]
    const zone = getLiveZone(msgs)
    expect(zone.frozenEnd).toBe(2)
    expect(zone.liveStart).toBe(2)
  })

  it('only assistant messages are not live by themselves', () => {
    const msgs = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'response' },
    ]
    const zone = getLiveZone(msgs)
    expect(zone.frozenEnd).toBe(0)
    expect(zone.liveStart).toBe(0)
  })
})
