/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { statusMessage, type StatusMessage, type Severity, VIEW_SHORTCUTS } from '../tui/status-message.js'

describe('statusMessage', () => {
  it('creates a message with severity', () => {
    const m = statusMessage.create('Tudo certo', 'ok')
    expect(m.text).toBe('Tudo certo')
    expect(m.severity).toBe('ok')
    expect(m.timestamp).toBeGreaterThan(0)
  })

  it('maps severity to color: ok → green, warn → yellow, error → red', () => {
    expect(statusMessage.color('ok')).toBe('green')
    expect(statusMessage.color('warn')).toBe('yellow')
    expect(statusMessage.color('error')).toBe('red')
  })

  it('isExpired returns true when past ttl', () => {
    const m = statusMessage.create('msg', 'ok', -1000)
    expect(statusMessage.isExpired(m, 500)).toBe(true)
  })

  it('isExpired returns false when within ttl', () => {
    const m = statusMessage.create('msg', 'ok')
    expect(statusMessage.isExpired(m, 5000)).toBe(false)
  })

  it('newest returns the most recent non-expired message', () => {
    const old = statusMessage.create('old', 'ok', -10000)
    const fresh = statusMessage.create('current', 'warn')
    const expired = statusMessage.create('stale', 'error', -10000)
    const msgs = [old, fresh, expired]
    expect(statusMessage.newest(msgs, 5000)?.text).toBe('current')
  })

  it('newest returns undefined when all expired', () => {
    const msgs = [statusMessage.create('old', 'ok', -10000), statusMessage.create('older', 'warn', -20000)]
    expect(statusMessage.newest(msgs, 5000)).toBeUndefined()
  })

  it('newest returns undefined for empty array', () => {
    expect(statusMessage.newest([], 5000)).toBeUndefined()
  })

  it('VIEW_SHORTCUTS has entries for all 5 views', () => {
    expect(Object.keys(VIEW_SHORTCUTS)).toHaveLength(5)
  })

  it('dashboard view has j/k and / shortcuts', () => {
    const keys = VIEW_SHORTCUTS.dashboard
    expect(keys.some((k) => k.key === 'j/k')).toBe(true)
    expect(keys.some((k) => k.key === '/')).toBe(true)
  })

  it('kanban view has different shortcuts', () => {
    const keys = VIEW_SHORTCUTS.kanban
    expect(keys.length).toBeGreaterThan(0)
    expect(VIEW_SHORTCUTS.kanban).not.toEqual(VIEW_SHORTCUTS.dashboard)
  })
})
