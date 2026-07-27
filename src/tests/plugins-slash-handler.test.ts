/*!
 * TDD: /plugins slash command handler (node_aa658235219e).
 *
 * AC1: /plugins disable <name> → disables plugin and returns confirmation.
 * AC2: Unknown plugin name → typed NOT_FOUND error string, no crash.
 */

import { describe, it, expect } from 'vitest'
import { handlePluginsCommand } from '../tui/slash/plugins-handler.js'
import { PluginRegistry } from '../core/plugins/plugin-registry.js'

function makeRegistry(): PluginRegistry {
  const r = new PluginRegistry()
  r.register({
    name: 'my-plugin',
    version: '1.0.0',
    capabilities: ['tool'],
    description: 'test',
    entryPoint: 'index.js',
    author: 'test',
    license: 'MIT',
    agfVersion: '>=0.1.0',
    tags: [],
  })
  return r
}

describe('AC1: disable a known plugin', () => {
  it('disables the plugin and returns a success message', () => {
    const r = makeRegistry()
    const result = handlePluginsCommand(['disable', 'my-plugin'], r)
    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/my-plugin/i)
    expect(r.list().find((p) => p.manifest.name === 'my-plugin')?.status).toBe('disabled')
  })

  it('enable re-enables a disabled plugin', () => {
    const r = makeRegistry()
    r.disable('my-plugin')
    const result = handlePluginsCommand(['enable', 'my-plugin'], r)
    expect(result.ok).toBe(true)
    expect(r.list().find((p) => p.manifest.name === 'my-plugin')?.status).toBe('enabled')
  })

  it('list returns all plugins with status', () => {
    const r = makeRegistry()
    const result = handlePluginsCommand(['list'], r)
    expect(result.ok).toBe(true)
    expect(result.message).toContain('my-plugin')
    expect(result.message).toContain('enabled')
  })
})

describe('AC2: unknown plugin → NOT_FOUND error, no crash', () => {
  it('returns error for unknown plugin on disable', () => {
    const r = makeRegistry()
    const result = handlePluginsCommand(['disable', 'unknown-plugin'], r)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('NOT_FOUND')
    expect(result.message).toContain('unknown-plugin')
  })

  it('returns error for unknown plugin on info', () => {
    const r = makeRegistry()
    const result = handlePluginsCommand(['info', 'ghost'], r)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('NOT_FOUND')
  })
})
