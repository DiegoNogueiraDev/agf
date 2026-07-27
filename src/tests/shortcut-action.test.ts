/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { shortcutAction, type ShortcutState } from '../tui/shortcut-action.js'

describe('shortcutAction', () => {
  it('idle factory returns idle state', () => {
    expect(shortcutAction.idle()).toEqual({ kind: 'idle' })
  })

  it('press idle + unknown returns idle', () => {
    const s = shortcutAction.press({ kind: 'idle' }, 'x')
    expect(s.kind).toBe('idle')
  })

  it('press d returns confirm delete state', () => {
    const s = shortcutAction.press({ kind: 'idle' }, 'd')
    expect(s.kind).toBe('confirm')
    expect(s.action).toBe('delete')
  })

  it('press c returns confirm consolidate state', () => {
    const s = shortcutAction.press({ kind: 'idle' }, 'c')
    expect(s.kind).toBe('confirm')
    expect(s.action).toBe('consolidate')
  })

  it('press r triggers immediate refresh', () => {
    const s = shortcutAction.press({ kind: 'idle' }, 'r')
    expect(s.kind).toBe('executing')
    expect(s.action).toBe('refresh')
  })

  it('unknown key returns idle', () => {
    const s = shortcutAction.press({ kind: 'idle' }, 'x')
    expect(s).toEqual({ kind: 'idle' })
  })

  it('in confirm state, y confirms the action', () => {
    const confirm: ShortcutState = { kind: 'confirm', action: 'delete' }
    const s = shortcutAction.press(confirm, 'y')
    expect(s.kind).toBe('executing')
    expect(s.action).toBe('delete')
  })

  it('in confirm state, n cancels', () => {
    const confirm: ShortcutState = { kind: 'confirm', action: 'delete' }
    const s = shortcutAction.press(confirm, 'N')
    expect(s).toEqual({ kind: 'idle' })
  })

  it('in confirm state, other keys remain in confirm', () => {
    const confirm: ShortcutState = { kind: 'confirm', action: 'consolidate' }
    const s = shortcutAction.press(confirm, 'x')
    expect(s.kind).toBe('confirm')
    expect(s.action).toBe('consolidate')
  })

  it('in executing state, any key returns to idle', () => {
    const exec: ShortcutState = { kind: 'executing', action: 'refresh' }
    const s = shortcutAction.press(exec, 'y')
    expect(s).toEqual({ kind: 'idle' })
  })

  it('label returns description for confirm states', () => {
    expect(shortcutAction.label({ kind: 'confirm', action: 'delete' })).toContain('DELETAR')
    expect(shortcutAction.label({ kind: 'confirm', action: 'consolidate' })).toContain('CONSOLIDAR')
    expect(shortcutAction.label({ kind: 'executing', action: 'refresh' })).toContain('REFRESH')
    expect(shortcutAction.label({ kind: 'idle' })).toBe('')
  })
})
