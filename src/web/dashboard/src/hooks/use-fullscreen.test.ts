/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Covers isFullscreenSupported() — the one pure function in this hook module.
 * useFullscreen() itself relies on the browser Fullscreen API (requestFullscreen/
 * exitFullscreen/fullscreenchange), which jsdom does not implement — meaningfully
 * testing it would require mocking the entire API surface for low signal.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { isFullscreenSupported, FULLSCREEN_SHORTCUT } from './use-fullscreen'

describe('isFullscreenSupported', () => {
  afterEach(() => {
    // @ts-expect-error — test-only cleanup of a property we define below
    delete document.fullscreenEnabled
  })

  it('returns false when neither fullscreenEnabled nor webkitFullscreenEnabled is set', () => {
    expect(isFullscreenSupported()).toBe(false)
  })

  it('returns true when document.fullscreenEnabled is true', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true })
    expect(isFullscreenSupported()).toBe(true)
  })
})

describe('FULLSCREEN_SHORTCUT', () => {
  it('describes both the Mac and Windows shortcut', () => {
    expect(FULLSCREEN_SHORTCUT).toContain('Cmd')
    expect(FULLSCREEN_SHORTCUT).toContain('Ctrl')
  })
})
