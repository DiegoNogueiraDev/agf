/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_c36bb9e2fb91 — C87-T1: tests for ErrorBoundary
 */

import { describe, it, expect } from 'vitest'
import { ErrorBoundary } from '../tui/error-boundary.js'

describe('ErrorBoundary', () => {
  it('is a constructor/class', () => {
    expect(typeof ErrorBoundary).toBe('function')
  })

  it('getDerivedStateFromError returns hasError:true', () => {
    const error = new Error('something went wrong')
    const state = ErrorBoundary.getDerivedStateFromError(error)
    expect(state.hasError).toBe(true)
  })

  it('getDerivedStateFromError captures error message', () => {
    const error = new Error('specific error message')
    const state = ErrorBoundary.getDerivedStateFromError(error)
    expect(state.errorMessage).toBe('specific error message')
  })

  it('getDerivedStateFromError falls back for error with no message', () => {
    const error = new Error('')
    const state = ErrorBoundary.getDerivedStateFromError(error)
    expect(typeof state.errorMessage).toBe('string')
    expect(state.errorMessage.length).toBeGreaterThan(0)
  })

  it('getDerivedStateFromError always returns object with hasError and errorMessage', () => {
    const state = ErrorBoundary.getDerivedStateFromError(new Error('x'))
    expect(state).toHaveProperty('hasError')
    expect(state).toHaveProperty('errorMessage')
  })
})
