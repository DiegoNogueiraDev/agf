/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_c36bb9e2fb91 — C87-T1: tests for WizardScreen component
 */

import { describe, it, expect } from 'vitest'
import { WizardScreen, detectProviders, buildWizardInitialState } from '../tui/wizard-screen.js'

describe('WizardScreen', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof WizardScreen).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(WizardScreen.name).toBeTruthy()
  })
})

describe('detectProviders', () => {
  it('detects providers with env vars set', () => {
    const env = { OPENAI_API_KEY: 'sk-test', OPENROUTER_API_KEY: 'or-test' }
    const result = detectProviders(env)
    const detected = result.filter((p) => p.detected)
    expect(detected.length).toBeGreaterThanOrEqual(1)
  })

  it('marks providers without env vars as unconfigured', () => {
    const env: Record<string, string> = {}
    const result = detectProviders(env)
    const unconfigured = result.filter((p) => !p.detected)
    expect(unconfigured.length).toBeGreaterThan(0)
    // copilot needs no key — always detected
    const copilot = result.find((p) => p.id === 'copilot')
    if (copilot) expect(copilot.detected).toBe(true)
  })
})

describe('buildWizardInitialState', () => {
  it('returns initial step and selectedProvider from env', () => {
    const env = { OPENROUTER_API_KEY: 'or-key' }
    const state = buildWizardInitialState(env)
    expect(typeof state.step).toBe('string')
    if (state.selectedProvider) {
      const detected = detectProviders(env).filter((p) => p.detected)
      expect(detected.map((p) => p.id)).toContain(state.selectedProvider)
    }
  })
})
