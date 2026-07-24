/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_c36bb9e2fb91 — C87-T1: tests for InteractiveApp component
 */

import { describe, it, expect } from 'vitest'
import { InteractiveApp } from '../tui/interactive-app.js'

describe('InteractiveApp', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof InteractiveApp).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(InteractiveApp.name).toBeTruthy()
  })
})
