/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { resolveAutopilotMode, buildDelegateMessage, type AutopilotModeOpts } from '../../cli/shared/autopilot-mode.js'

describe('autopilot-mode — resolveAutopilotMode', () => {
  it('--delegate retorna delegate independente de live/env', () => {
    const opts: AutopilotModeOpts = { delegate: true, live: false, isEnvDelegated: false }
    expect(resolveAutopilotMode(opts)).toBe('delegate')
  })

  it('--live sem --delegate retorna live', () => {
    const opts: AutopilotModeOpts = { delegate: false, live: true, isEnvDelegated: false }
    expect(resolveAutopilotMode(opts)).toBe('live')
  })

  it('live + delegate => delegate vence', () => {
    const opts: AutopilotModeOpts = { delegate: true, live: true, isEnvDelegated: true }
    expect(resolveAutopilotMode(opts)).toBe('delegate')
  })

  it('sem flags: delegated env => delegate', () => {
    const opts: AutopilotModeOpts = { delegate: false, live: false, isEnvDelegated: true }
    expect(resolveAutopilotMode(opts)).toBe('delegate')
  })

  it('sem flags: non-delegated env => live', () => {
    const opts: AutopilotModeOpts = { delegate: false, live: false, isEnvDelegated: false }
    expect(resolveAutopilotMode(opts)).toBe('live')
  })
})

describe('autopilot-mode — buildDelegateMessage', () => {
  it('inclui agf submit <id> quando taskId é fornecido', () => {
    const msg = buildDelegateMessage('n123')
    expect(msg).toContain('agf submit n123')
    expect(msg).toContain('--result')
  })

  it('usa placeholder <id> quando taskId é undefined', () => {
    const msg = buildDelegateMessage()
    expect(msg).toContain('agf submit <id>')
  })

  it('contém a descrição do modo delegado', () => {
    const msg = buildDelegateMessage('t1')
    expect(msg).toContain('Aguardando pilot')
  })
})
