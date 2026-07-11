/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_c36bb9e2fb91 — C87-T1: tests for CommandBar component
 */

import { describe, it, expect } from 'vitest'
import { CommandBar } from '../tui/command-bar.js'

describe('CommandBar', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof CommandBar).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(CommandBar.name).toBeTruthy()
  })
})
