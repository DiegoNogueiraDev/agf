/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { vimNav, type VimNavState } from '../tui/vim-nav.js'

describe('vimNav', () => {
  it('initializes with cursor at 0', () => {
    const state: VimNavState = vimNav.init(5, 0)
    expect(state.cursor).toBe(0)
    expect(state.count).toBe(5)
  })

  it('clamps cursor to max index on init', () => {
    const state: VimNavState = vimNav.init(5, 10)
    expect(state.cursor).toBe(4)
  })

  it('clamps cursor to 0 on init when negative', () => {
    const state: VimNavState = vimNav.init(5, -1)
    expect(state.cursor).toBe(0)
  })

  it('handles empty list', () => {
    const state: VimNavState = vimNav.init(0, 0)
    expect(state.cursor).toBe(0)
    expect(state.count).toBe(0)
  })

  it('j moves cursor down', () => {
    const state = vimNav.handleKey({ cursor: 0, count: 5 }, 'j')
    expect(state.cursor).toBe(1)
  })

  it('k moves cursor up', () => {
    const state = vimNav.handleKey({ cursor: 3, count: 5 }, 'k')
    expect(state.cursor).toBe(2)
  })

  it('j stops at last item', () => {
    const state = vimNav.handleKey({ cursor: 4, count: 5 }, 'j')
    expect(state.cursor).toBe(4)
  })

  it('k stops at first item', () => {
    const state = vimNav.handleKey({ cursor: 0, count: 5 }, 'k')
    expect(state.cursor).toBe(0)
  })

  it('G moves to last item', () => {
    const state = vimNav.handleKey({ cursor: 0, count: 5 }, 'G')
    expect(state.cursor).toBe(4)
  })

  it('g moves to first item', () => {
    const state = vimNav.handleKey({ cursor: 4, count: 5 }, 'g')
    expect(state.cursor).toBe(0)
  })

  it('g on empty list stays at 0', () => {
    const state = vimNav.handleKey({ cursor: 0, count: 0 }, 'g')
    expect(state.cursor).toBe(0)
  })

  it('G on empty list stays at 0', () => {
    const state = vimNav.handleKey({ cursor: 0, count: 0 }, 'G')
    expect(state.cursor).toBe(0)
  })

  it('unknown key returns same state', () => {
    const state = vimNav.handleKey({ cursor: 2, count: 5 }, 'x')
    expect(state.cursor).toBe(2)
  })

  it('updateCount refreshes total and clamps', () => {
    const state = vimNav.updateCount({ cursor: 4, count: 10 }, 3)
    expect(state.count).toBe(3)
    expect(state.cursor).toBe(2)
  })

  it('updateCount handles growth without changing cursor', () => {
    const state = vimNav.updateCount({ cursor: 2, count: 3 }, 10)
    expect(state.count).toBe(10)
    expect(state.cursor).toBe(2)
  })

  it('isAtStart returns true when cursor is 0', () => {
    expect(vimNav.isAtStart({ cursor: 0, count: 5 })).toBe(true)
    expect(vimNav.isAtEnd({ cursor: 4, count: 5 })).toBe(true)
  })

  it('isAtEnd returns true when cursor is at last', () => {
    expect(vimNav.isAtStart({ cursor: 1, count: 5 })).toBe(false)
    expect(vimNav.isAtEnd({ cursor: 3, count: 5 })).toBe(false)
  })
})

describe('VimNavState type', () => {
  it('has cursor and count', () => {
    const s: VimNavState = { cursor: 0, count: 1 }
    expect(s.cursor).toBe(0)
    expect(s.count).toBe(1)
  })

  it('immutable operations return new objects', () => {
    const original: VimNavState = { cursor: 0, count: 5 }
    const next = vimNav.handleKey(original, 'j')
    expect(original.cursor).toBe(0)
    expect(next.cursor).toBe(1)
    expect(original).not.toBe(next)
  })
})
