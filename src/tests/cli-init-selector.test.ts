/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  resolveCliSelection,
  type CliSelectionOptions,
  type CliSelectionResult,
  CLI_PROVIDER_SETTING,
} from '../core/cli-provider/cli-init-selector.js'

describe('resolveCliSelection', () => {
  it('auto-detects opencode when env var is set', () => {
    const result = resolveCliSelection({
      env: { OPENCODE: '1' },
    })
    expect(result.source).toBe('opencode')
    expect(result.mode).toBe('hook')
    expect(result.autoDetected).toBe(true)
  })

  it('auto-detects claude when env var is set', () => {
    const result = resolveCliSelection({
      env: { CLAUDE_CODE: 'true' },
    })
    expect(result.source).toBe('claude')
    expect(result.mode).toBe('hook')
    expect(result.autoDetected).toBe(true)
  })

  it('returns unknown when nothing detected', () => {
    const result = resolveCliSelection({ env: {} })
    expect(result.source).toBe('unknown')
    expect(result.mode).toBe('direct')
    expect(result.autoDetected).toBe(false)
  })

  it('uses stored setting when available', () => {
    const result = resolveCliSelection({
      env: { OPENCODE: '1' },
      storedSetting: 'claude',
    })
    // Stored setting overrides auto-detect
    expect(result.source).toBe('claude')
    expect(result.mode).toBe('hook')
    expect(result.autoDetected).toBe(false)
  })

  it('returns direct mode for mcp-graph', () => {
    const result = resolveCliSelection({
      env: {},
      storedSetting: 'mcp-graph',
    })
    expect(result.source).toBe('mcp-graph')
    expect(result.mode).toBe('direct')
    expect(result.autoDetected).toBe(false)
  })

  it('returns hook mode for codex', () => {
    const result = resolveCliSelection({
      env: {},
      storedSetting: 'codex',
    })
    expect(result.source).toBe('codex')
    expect(result.mode).toBe('hook')
    expect(result.autoDetected).toBe(false)
  })

  it('returns direct mode for copilot', () => {
    const result = resolveCliSelection({
      env: {},
      storedSetting: 'copilot',
    })
    expect(result.source).toBe('copilot')
    expect(result.mode).toBe('direct')
  })

  it('unknown stored setting falls back to default unknown', () => {
    const result = resolveCliSelection({
      env: {},
      storedSetting: 'invalid-cli',
    })
    expect(result.source).toBe('unknown')
    expect(result.mode).toBe('direct')
  })

  it('returns result with all required fields', () => {
    const result = resolveCliSelection({ env: { OPENCODE: '1' } })
    expect(result.source).toBeDefined()
    expect(result.mode).toBeDefined()
    expect(typeof result.autoDetected).toBe('boolean')
    expect(typeof result.label).toBe('string')
  })

  it('CLI_PROVIDER_SETTING is defined', () => {
    expect(CLI_PROVIDER_SETTING).toBe('cli_provider')
  })
})

describe('CliSelectionOptions type', () => {
  it('requires env', () => {
    const opts: CliSelectionOptions = { env: { TEST: '1' } }
    expect(opts.env.TEST).toBe('1')
  })

  it('storedSetting is optional', () => {
    const opts: CliSelectionOptions = { env: {} }
    expect(opts.storedSetting).toBeUndefined()
  })
})

describe('CliSelectionResult type', () => {
  it('conforms to expected shape', () => {
    const result: CliSelectionResult = {
      source: 'opencode',
      mode: 'hook',
      label: 'OpenCode',
      autoDetected: true,
    }
    expect(result.source).toBe('opencode')
    expect(result.label).toBe('OpenCode')
  })
})
