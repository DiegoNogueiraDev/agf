/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { tabNav, VIEWS } from '../tui/tab-nav.js'

describe('tabNav', () => {
  it('has 5 views', () => {
    expect(VIEWS).toEqual(['dashboard', 'kanban', 'tree', 'health', 'economy'])
  })

  it('press number key switches to that view', () => {
    expect(tabNav.press('dashboard', 1)).toBe('dashboard')
    expect(tabNav.press('dashboard', 2)).toBe('kanban')
    expect(tabNav.press('kanban', 1)).toBe('dashboard')
  })

  it('press invalid number returns current', () => {
    expect(tabNav.press('dashboard', 0)).toBe('dashboard')
    expect(tabNav.press('dashboard', 6)).toBe('dashboard')
    expect(tabNav.press('dashboard', -1)).toBe('dashboard')
  })

  it('press 3 switches to tree', () => {
    expect(tabNav.press('dashboard', 3)).toBe('tree')
  })

  it('press 4 switches to health', () => {
    expect(tabNav.press('dashboard', 4)).toBe('health')
  })

  it('press 5 switches to economy', () => {
    expect(tabNav.press('dashboard', 5)).toBe('economy')
  })

  it('press Tab cycles forward', () => {
    expect(tabNav.press('dashboard', 'tab')).toBe('kanban')
    expect(tabNav.press('kanban', 'tab')).toBe('tree')
    expect(tabNav.press('tree', 'tab')).toBe('health')
    expect(tabNav.press('health', 'tab')).toBe('economy')
    expect(tabNav.press('economy', 'tab')).toBe('dashboard')
  })

  it('press Shift+Tab cycles backward', () => {
    expect(tabNav.press('dashboard', 'shiftTab')).toBe('economy')
    expect(tabNav.press('economy', 'shiftTab')).toBe('health')
    expect(tabNav.press('health', 'shiftTab')).toBe('tree')
    expect(tabNav.press('tree', 'shiftTab')).toBe('kanban')
    expect(tabNav.press('kanban', 'shiftTab')).toBe('dashboard')
  })

  it('label returns display name', () => {
    expect(tabNav.label('dashboard')).toBe('1 Dashboard')
    expect(tabNav.label('kanban')).toBe('2 Kanban')
    expect(tabNav.label('tree')).toBe('3 Árvore')
    expect(tabNav.label('health')).toBe('4 Saúde')
    expect(tabNav.label('economy')).toBe('5 Economia')
  })

  it('indexOf returns 0-based position', () => {
    expect(tabNav.indexOf('dashboard')).toBe(0)
    expect(tabNav.indexOf('economy')).toBe(4)
    expect(tabNav.indexOf('nonexistent' as any)).toBe(-1)
  })

  it('fromIndex returns view at position', () => {
    expect(tabNav.fromIndex(0)).toBe('dashboard')
    expect(tabNav.fromIndex(4)).toBe('economy')
    expect(tabNav.fromIndex(99)).toBe('dashboard')
  })
})

describe('TabNav type', () => {
  it('ViewName is one of the 5 views', () => {
    const v: import('../tui/tab-nav.js').ViewName = 'dashboard'
    expect(v).toBe('dashboard')
  })
})
