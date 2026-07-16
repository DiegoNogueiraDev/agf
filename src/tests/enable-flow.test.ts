import { describe, it, expect, vi } from 'vitest'
import { setFlowEnabled, enableFlowConfig } from '../cli/shared/enable-flow.js'
import type { FlowToggleStore } from '../cli/shared/enable-flow.js'

function makeStore(initial: string | null = null): FlowToggleStore & { data: Record<string, string> } {
  const data: Record<string, string> = {}
  if (initial !== null) data['flow_config'] = initial
  return {
    data,
    getProjectSetting(key: string) {
      return data[key] ?? null
    },
    setProjectSetting(key: string, value: string) {
      data[key] = value
    },
  }
}

describe('setFlowEnabled', () => {
  it('sets enabled=true in flow_config', () => {
    const store = makeStore()
    setFlowEnabled(store, true)
    const saved = store.getProjectSetting('flow_config')
    expect(saved).not.toBeNull()
    expect(JSON.parse(saved!).enabled).toBe(true)
  })

  it('sets enabled=false in flow_config', () => {
    const store = makeStore()
    setFlowEnabled(store, false)
    const saved = store.getProjectSetting('flow_config')
    expect(JSON.parse(saved!).enabled).toBe(false)
  })

  it('merges with existing config', () => {
    const store = makeStore(JSON.stringify({ someOtherKey: 42 }))
    setFlowEnabled(store, true)
    const saved = JSON.parse(store.getProjectSetting('flow_config')!)
    expect(saved.someOtherKey).toBe(42)
    expect(saved.enabled).toBe(true)
  })

  it('handles invalid JSON in existing config gracefully', () => {
    const store = makeStore('not-valid-json')
    expect(() => setFlowEnabled(store, true)).not.toThrow()
    const saved = JSON.parse(store.getProjectSetting('flow_config')!)
    expect(saved.enabled).toBe(true)
  })
})

describe('enableFlowConfig', () => {
  it('sets enabled=true', () => {
    const store = makeStore()
    enableFlowConfig(store)
    const saved = JSON.parse(store.getProjectSetting('flow_config')!)
    expect(saved.enabled).toBe(true)
  })
})
