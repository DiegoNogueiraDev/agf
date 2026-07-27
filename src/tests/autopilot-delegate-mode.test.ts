/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 0.1 — agf autopilot --delegate como Modo Primário Nomeado
 *
 * AC:
 * 1. --delegate flag registrado no comando autopilot
 * 2. --live preservado como backward-compat
 * 3. resolveAutopilotMode: sem flags + detectado delegated → 'delegate'
 * 4. agf status mostra mode: 'delegate' | 'live'
 * 5. buildDelegateMessage inclui "Aguardando pilot: agf submit <id> --result"
 */
import { describe, it, expect } from 'vitest'
import { autopilotCommand } from '../cli/commands/autopilot-cmd.js'
import { resolveAutopilotMode, buildDelegateMessage } from '../cli/shared/autopilot-mode.js'

describe('autopilot --delegate flag (AC#1 + AC#2)', () => {
  it('registra a flag --delegate no comando', () => {
    const cmd = autopilotCommand()
    const delegateOpt = cmd.options.find((o) => o.long === '--delegate')
    expect(delegateOpt).toBeDefined()
    expect(delegateOpt?.description).toBeTruthy()
  })

  it('mantém --live como flag independente (backward-compat)', () => {
    const cmd = autopilotCommand()
    const liveOpt = cmd.options.find((o) => o.long === '--live')
    expect(liveOpt).toBeDefined()
  })

  it('--delegate e --live são flags booleanas independentes', () => {
    const cmd = autopilotCommand()
    const delegateOpt = cmd.options.find((o) => o.long === '--delegate')
    const liveOpt = cmd.options.find((o) => o.long === '--live')
    expect(delegateOpt?.defaultValue).toBe(false)
    expect(liveOpt?.defaultValue).toBe(false)
  })
})

describe('resolveAutopilotMode (AC#3)', () => {
  it('--delegate explícito → mode delegate', () => {
    const mode = resolveAutopilotMode({ delegate: true, live: false, isEnvDelegated: false })
    expect(mode).toBe('delegate')
  })

  it('--live explícito + LLM available → mode live', () => {
    const mode = resolveAutopilotMode({ delegate: false, live: true, isEnvDelegated: false })
    expect(mode).toBe('live')
  })

  it('sem flags + ambiente delegado → mode delegate (AC#3)', () => {
    const mode = resolveAutopilotMode({ delegate: false, live: false, isEnvDelegated: true })
    expect(mode).toBe('delegate')
  })

  it('sem flags + ambiente autônomo → mode live', () => {
    const mode = resolveAutopilotMode({ delegate: false, live: false, isEnvDelegated: false })
    expect(mode).toBe('live')
  })

  it('--delegate + --live simultâneos → delegate vence (delegate-first)', () => {
    const mode = resolveAutopilotMode({ delegate: true, live: true, isEnvDelegated: false })
    expect(mode).toBe('delegate')
  })
})

describe('buildDelegateMessage (AC#5)', () => {
  it('inclui "Aguardando pilot" quando taskId fornecido', () => {
    const msg = buildDelegateMessage('node_abc123')
    expect(msg).toContain('Aguardando pilot')
    expect(msg).toContain('agf submit node_abc123')
    expect(msg).toContain('--result')
  })

  it('inclui esquema JSON esperado no retorno', () => {
    const msg = buildDelegateMessage('node_xyz')
    expect(msg).toContain('"arquivos"')
    expect(msg).toContain('"testes"')
    expect(msg).toContain('"desvios"')
  })

  it('funciona sem taskId (delegate sem task específica)', () => {
    const msg = buildDelegateMessage()
    expect(msg).toContain('Aguardando pilot')
    expect(msg).toContain('agf submit')
  })
})
