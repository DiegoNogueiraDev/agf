/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { listPresetLines, showPresetLines, applyPreset } from '../../cli/commands/preset-cmd.js'
import { getEffectiveStrictness } from '../../core/presets/preset-gate-adapter.js'

describe('preset-cmd — conectado ao core/presets', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('lista os presets built-in reais (não strings fixas)', () => {
    const lines = listPresetLines()
    expect(lines.length).toBeGreaterThanOrEqual(4)
    const joined = lines.join('\n')
    expect(joined).toContain('default')
    expect(joined).toContain('strict-tdd')
    expect(joined).toContain('agile-light')
    expect(joined).toContain('enterprise')
    expect(joined).toContain('strictness=')
  })

  it('show retorna detalhes do preset real e null para desconhecido', () => {
    const lines = showPresetLines('strict-tdd')
    expect(lines).not.toBeNull()
    expect(lines!.join('\n')).toContain('strict-tdd')
    expect(showPresetLines('nao-existe')).toBeNull()
  })

  it('apply persiste active_preset e muda a strictness efetiva do gate', () => {
    const result = applyPreset(store, 'strict-tdd')
    expect(result).toBeDefined()
    expect(result!.name).toBe('strict-tdd')
    // prova de que não é teatro: a chave que o gate-adapter lê foi gravada
    expect(store.getProjectSetting('active_preset')).toBe('strict-tdd')
    // e a strictness efetiva resolvida bate com o retorno
    expect(result!.strictness).toBe(getEffectiveStrictness(store))
  })

  it('apply de preset desconhecido retorna undefined e não grava nada', () => {
    expect(applyPreset(store, 'fantasma')).toBeUndefined()
    expect(store.getProjectSetting('active_preset')).toBeNull()
  })
})
