/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_c36bb9e2fb91 — C87-T1: tests for App component (app.tsx)
 */

import { describe, it, expect } from 'vitest'
import { App } from '../tui/app.js'

describe('App', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof App).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(App.name).toBeTruthy()
  })
})
