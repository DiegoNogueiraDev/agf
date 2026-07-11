/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_c36bb9e2fb91 — C87-T1: tests for BannerScreen component
 */

import { describe, it, expect } from 'vitest'
import { BannerScreen } from '../tui/banner-screen.js'

describe('BannerScreen', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof BannerScreen).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(BannerScreen.name).toBeTruthy()
  })
})
