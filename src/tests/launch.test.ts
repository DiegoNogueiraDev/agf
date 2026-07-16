import { describe, it, expect, vi } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'

describe('launch.ts store integration', () => {
  it('SqliteStore in-memory inicializa para launch', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('test')
    store.setProjectSetting('provider', 'copilot')
    expect(store.getProjectSetting('provider')).toBe('copilot')
    store.close()
  })

  it('store sem project definido não quebra', () => {
    const store = SqliteStore.open(':memory:')
    expect(() => store.getProject()).not.toThrow()
    store.close()
  })
})
