/*!
 * Tests for agf config get|set|list (node_d7c3201b8c37)
 * AC:
 *   - config set provider openrouter → persists; config get provider → openrouter
 *   - Unknown config key → typed error
 */

import { describe, it, expect } from 'vitest'
import { configGet, configSet, configList, CONFIG_KEYS } from '../cli/commands/config-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('test-project')
  return store
}

describe('configSet / configGet', () => {
  it('set provider then get returns the value', () => {
    const store = makeStore()
    configSet(store, 'provider', 'openrouter')
    const value = configGet(store, 'provider')
    expect(value).toBe('openrouter')
  })

  it('set provider_base_url then get returns it', () => {
    const store = makeStore()
    configSet(store, 'provider_base_url', 'http://localhost:11434/v1')
    expect(configGet(store, 'provider_base_url')).toBe('http://localhost:11434/v1')
  })

  it('get returns null for unset key', () => {
    const store = makeStore()
    expect(configGet(store, 'provider')).toBeNull()
  })

  it('set with unknown key throws typed error', () => {
    const store = makeStore()
    expect(() => configSet(store, 'unknown_key' as never, 'value')).toThrow()
  })

  it('get with unknown key throws typed error', () => {
    const store = makeStore()
    expect(() => configGet(store, 'unknown_key' as never)).toThrow()
  })
})

describe('configList', () => {
  it('returns all config keys with values', () => {
    const store = makeStore()
    configSet(store, 'provider', 'groq')
    const list = configList(store)
    const providerEntry = list.find((e) => e.key === 'provider')
    expect(providerEntry).toBeDefined()
    expect(providerEntry?.value).toBe('groq')
  })

  it('includes all CONFIG_KEYS', () => {
    const store = makeStore()
    const list = configList(store)
    for (const key of CONFIG_KEYS) {
      expect(list.find((e) => e.key === key)).toBeDefined()
    }
  })
})
