import { describe, it, expect } from 'vitest'
import {
  PluginRegistry,
  PluginConflictError,
  PluginDependencyError,
  PluginDependentError,
  PluginNotFoundError,
} from '../../core/plugins/plugin-registry.js'
import type { PluginManifest } from '../../core/plugins/plugin-registry.js'

function makeManifest(name: string, opts?: { requires?: string[]; conflicts?: string[] }): PluginManifest {
  return {
    name,
    version: '1.0.0',
    requires: opts?.requires ? { plugins: opts.requires } : undefined,
    conflicts: opts?.conflicts,
  } as PluginManifest
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry

  beforeEach(() => {
    registry = new PluginRegistry()
  })

  it('register adds a plugin with enabled status', () => {
    registry.register(makeManifest('plugin-a'))
    expect(registry.has('plugin-a')).toBe(true)
    expect(registry.get('plugin-a')?.status).toBe('enabled')
  })

  it('remove removes a plugin', () => {
    registry.register(makeManifest('plugin-a'))
    registry.remove('plugin-a')
    expect(registry.has('plugin-a')).toBe(false)
  })

  it('enable/disable toggles plugin status', () => {
    registry.register(makeManifest('plugin-a'))
    registry.disable('plugin-a')
    expect(registry.get('plugin-a')?.status).toBe('disabled')
    registry.enable('plugin-a')
    expect(registry.get('plugin-a')?.status).toBe('enabled')
  })

  it('dependent blocks removal with PluginDependentError', () => {
    registry.register(makeManifest('base'))
    registry.register(makeManifest('dependent', { requires: ['base'] }))

    expect(() => registry.remove('base')).toThrow(PluginDependentError)
  })

  it('bidirectional conflict detection throws PluginConflictError', () => {
    registry.register(makeManifest('plugin-a'))
    expect(() => registry.register(makeManifest('plugin-b', { conflicts: ['plugin-a'] }))).toThrow(PluginConflictError)
  })

  it('conflict detection works both directions', () => {
    registry.register(makeManifest('plugin-a', { conflicts: ['plugin-b'] }))
    expect(() => registry.register(makeManifest('plugin-b'))).toThrow(PluginConflictError)
  })

  it('missing dependency throws PluginDependencyError', () => {
    expect(() => registry.register(makeManifest('plugin-a', { requires: ['nonexistent'] }))).toThrow(
      PluginDependencyError,
    )
  })

  it('PluginNotFoundError for unknown plugin', () => {
    expect(() => registry.remove('unknown')).toThrow(PluginNotFoundError)
    expect(() => registry.enable('unknown')).toThrow(PluginNotFoundError)
    expect(() => registry.disable('unknown')).toThrow(PluginNotFoundError)
  })

  it('list returns all registered plugins', () => {
    registry.register(makeManifest('a'))
    registry.register(makeManifest('b'))
    expect(registry.list()).toHaveLength(2)
  })

  it('has returns true for registered, false for unregistered', () => {
    registry.register(makeManifest('a'))
    expect(registry.has('a')).toBe(true)
    expect(registry.has('b')).toBe(false)
  })
})
