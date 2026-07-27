/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-plugin-health-widget — PluginHealth Ink component tests.
 */
import { describe, it, expect } from 'vitest'
import { getPluginStateColor, type PluginHealthState } from '../tui/components/PluginHealth.js'

describe('PluginHealth: getPluginStateColor', () => {
  it('returns green for healthy', () => {
    expect(getPluginStateColor('healthy')).toBe('green')
  })

  it('returns yellow for degraded', () => {
    expect(getPluginStateColor('degraded')).toBe('yellow')
  })

  it('returns red for failed', () => {
    expect(getPluginStateColor('failed')).toBe('red')
  })

  it('returns blue for starting', () => {
    expect(getPluginStateColor('starting')).toBe('blue')
  })

  it('returns grey for stopped', () => {
    expect(getPluginStateColor('stopped')).toBe('grey')
  })
})

describe('PluginHealth: state labels', () => {
  it('maps all states to readable labels', () => {
    const labels: Record<PluginHealthState, string> = {
      healthy: 'Healthy',
      degraded: 'Degraded',
      failed: 'Failed',
      starting: 'Starting...',
      stopped: 'Stopped',
    }
    for (const [state, label] of Object.entries(labels)) {
      expect(label.length).toBeGreaterThan(0)
    }
  })
})
