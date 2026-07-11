/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_c36bb9e2fb91 — C87-T1: tests for toast-overlay pushToast + ToastOverlay
 */

import { describe, it, expect } from 'vitest'
import { pushToast, ToastOverlay } from '../tui/toast-overlay.js'

describe('pushToast', () => {
  it('is a function', () => {
    expect(typeof pushToast).toBe('function')
  })

  it('returns a non-empty string (toast id)', () => {
    const id = pushToast('Test notification')
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('different calls return different ids', () => {
    const id1 = pushToast('First')
    const id2 = pushToast('Second')
    expect(id1).not.toBe(id2)
  })

  it('does not throw for empty message', () => {
    expect(() => pushToast('')).not.toThrow()
  })
})

describe('ToastOverlay', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof ToastOverlay).toBe('function')
  })
})
