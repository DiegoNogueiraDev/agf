/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { setFlowEnabled, enableFlowConfig, type FlowToggleStore } from '../../cli/shared/enable-flow.js'

function makeStore(initial?: Record<string, string>): FlowToggleStore {
  const data: Record<string, string> = { ...initial }
  return {
    getProjectSetting(key: string) {
      return data[key] ?? null
    },
    setProjectSetting(key: string, value: string) {
      data[key] = value
    },
  }
}

describe('enable-flow — setFlowEnabled', () => {
  it('ativa flow quando não havia configuração', () => {
    const store = makeStore()
    setFlowEnabled(store, true)
    const raw = store.getProjectSetting('flow_config')
    expect(raw).not.toBeNull()
    const config = JSON.parse(raw!)
    expect(config.enabled).toBe(true)
  })

  it('ativa flow preservando config existente', () => {
    const store = makeStore({ flow_config: JSON.stringify({ lambda: 0.5 }) })
    setFlowEnabled(store, true)
    const config = JSON.parse(store.getProjectSetting('flow_config')!)
    expect(config.enabled).toBe(true)
    expect(config.lambda).toBe(0.5)
  })

  it('desativa flow sem perder overrides', () => {
    const store = makeStore({ flow_config: JSON.stringify({ lambda: 0.5 }) })
    setFlowEnabled(store, false)
    const config = JSON.parse(store.getProjectSetting('flow_config')!)
    expect(config.enabled).toBe(false)
    expect(config.lambda).toBe(0.5)
  })

  it('trata JSON corrompido como objeto vazio', () => {
    const store = makeStore({ flow_config: 'not-json' })
    setFlowEnabled(store, true)
    const config = JSON.parse(store.getProjectSetting('flow_config')!)
    expect(config.enabled).toBe(true)
  })
})

describe('enable-flow — enableFlowConfig', () => {
  it('chama setFlowEnabled com true', () => {
    const store = makeStore()
    enableFlowConfig(store)
    const config = JSON.parse(store.getProjectSetting('flow_config')!)
    expect(config.enabled).toBe(true)
  })
})
