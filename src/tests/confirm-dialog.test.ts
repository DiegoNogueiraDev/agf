/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_c36bb9e2fb91 — C87-T1: tests for ConfirmDialog component
 */

import { describe, it, expect } from 'vitest'
import { ConfirmDialog } from '../tui/confirm-dialog.js'

describe('ConfirmDialog', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof ConfirmDialog).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(ConfirmDialog.name).toBeTruthy()
  })
})
