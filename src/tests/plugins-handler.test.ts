/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { handlePluginsCommand } from '../tui/slash/plugins-handler.js'
import { PluginRegistry } from '../core/plugins/plugin-registry.js'
import type { PluginManifest } from '../core/plugins/plugin-registry.js'

function manifest(name: string): PluginManifest {
  return { name, version: '1.0.0' } as PluginManifest
}

describe('handlePluginsCommand', () => {
  let registry: PluginRegistry

  beforeEach(() => {
    registry = new PluginRegistry()
  })

  it('list: reports no plugins when the registry is empty', () => {
    const result = handlePluginsCommand(['list'], registry)
    expect(result.ok).toBe(true)
    expect(result.message).toContain('Nenhum plugin registrado')
  })

  it('list (default, no subcommand): behaves the same as explicit "list"', () => {
    const result = handlePluginsCommand([], registry)
    expect(result.ok).toBe(true)
  })

  it('list: shows each registered plugin with name, version, and status', () => {
    registry.register(manifest('my-plugin'))
    const result = handlePluginsCommand(['list'], registry)
    expect(result.message).toContain('my-plugin@1.0.0')
    expect(result.message).toContain('enabled')
  })

  it('enable/disable: requires a plugin name', () => {
    expect(handlePluginsCommand(['enable'], registry).code).toBe('USAGE')
    expect(handlePluginsCommand(['disable'], registry).code).toBe('USAGE')
  })

  it('enable/disable: reports NOT_FOUND for an unregistered plugin', () => {
    const result = handlePluginsCommand(['enable', 'ghost'], registry)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('NOT_FOUND')
  })

  it('disable then enable: round-trips a real plugin', () => {
    registry.register(manifest('toggle-me'))
    const disabled = handlePluginsCommand(['disable', 'toggle-me'], registry)
    expect(disabled.ok).toBe(true)
    expect(disabled.message).toContain('desabilitado')

    const enabled = handlePluginsCommand(['enable', 'toggle-me'], registry)
    expect(enabled.ok).toBe(true)
    expect(enabled.message).toContain('habilitado')
  })

  it('info: requires a plugin name', () => {
    expect(handlePluginsCommand(['info'], registry).code).toBe('USAGE')
  })

  it('info: reports NOT_FOUND for an unregistered plugin', () => {
    const result = handlePluginsCommand(['info', 'ghost'], registry)
    expect(result.code).toBe('NOT_FOUND')
  })

  it('info: reports name, version, status, and hook count for a real plugin', () => {
    registry.register(manifest('info-plugin'))
    const result = handlePluginsCommand(['info', 'info-plugin'], registry)
    expect(result.ok).toBe(true)
    expect(result.message).toContain('info-plugin@1.0.0')
    expect(result.message).toContain('Status: enabled')
  })

  it('unknown subcommand returns a usage error', () => {
    const result = handlePluginsCommand(['bogus'], registry)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('USAGE')
  })
})
