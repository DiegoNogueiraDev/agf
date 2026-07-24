/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { toastManager, type Toast, type ToastSeverity } from '../tui/toast-manager.js'

describe('toastManager', () => {
  beforeEach(() => toastManager._reset())
  it('creates a toast with defaults', () => {
    const t = toastManager.create('Task done')
    expect(t.text).toBe('Task done')
    expect(t.severity).toBe('info')
    expect(t.id).toBeDefined()
    expect(t.createdAt).toBeGreaterThan(0)
  })

  it('creates toast with custom severity', () => {
    const t = toastManager.create('Error!', 'error')
    expect(t.severity).toBe('error')
  })

  it('add stores toast and returns id', () => {
    const id = toastManager.add('Hello')
    expect(typeof id).toBe('string')
  })

  it('dismiss removes toast by id', () => {
    const id = toastManager.add('Test')
    expect(toastManager.getAll().length).toBe(1)
    toastManager.dismiss(id)
    expect(toastManager.getAll().length).toBe(0)
  })

  it('clear removes all', () => {
    toastManager.add('A')
    toastManager.add('B')
    toastManager.clear()
    expect(toastManager.getAll().length).toBe(0)
  })

  it('maxToast config limits visible toasts', () => {
    for (let i = 0; i < 10; i++) toastManager.add(`Toast ${i}`)
    const toasts = toastManager.getVisible()
    expect(toasts.length).toBeLessThanOrEqual(5)
    toastManager.clear()
  })

  it('severityColor returns correct Ink color', () => {
    expect(toastManager.severityColor('info')).toBe('green')
    expect(toastManager.severityColor('warn')).toBe('yellow')
    expect(toastManager.severityColor('error')).toBe('red')
  })

  it('isExpired returns true for old toasts', () => {
    const t: Toast = { id: 'x', text: 'old', severity: 'info', createdAt: Date.now() - 10000 }
    expect(toastManager.isExpired(t, 3000)).toBe(true)
  })

  it('isExpired returns false for recent toasts', () => {
    const t: Toast = { id: 'x', text: 'new', severity: 'info', createdAt: Date.now() }
    expect(toastManager.isExpired(t, 5000)).toBe(false)
  })
})
