/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_e8d325204543 — C74-T1: tests for resolveLoadOrder
 *
 * AC: no-dep order preserved; deps before dependents;
 *     circular dep throws PluginCircularDependencyError; blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { resolveLoadOrder, PluginCircularDependencyError } from '../core/plugins/plugin-loader.js'
import type { PluginManifest } from '../core/plugins/plugin-registry.js'

function makeManifest(name: string, deps: string[] = []): PluginManifest {
  return {
    name,
    version: '1.0.0',
    description: `Plugin ${name}`,
    entryPoint: `./plugins/${name}.js`,
    capabilities: ['tools'],
    requires: deps.length ? { plugins: deps } : undefined,
  }
}

describe('resolveLoadOrder', () => {
  it('returns empty array for no manifests', () => {
    expect(resolveLoadOrder([])).toEqual([])
  })

  it('returns single manifest unchanged', () => {
    const m = makeManifest('alpha')
    const result = resolveLoadOrder([m])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('alpha')
  })

  it('two independent plugins: order preserved', () => {
    const a = makeManifest('alpha')
    const b = makeManifest('beta')
    const result = resolveLoadOrder([a, b])
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.name)).toContain('alpha')
    expect(result.map((r) => r.name)).toContain('beta')
  })

  it('dependency is placed before dependent', () => {
    const base = makeManifest('base')
    const dependent = makeManifest('dependent', ['base'])
    const result = resolveLoadOrder([dependent, base])
    const names = result.map((r) => r.name)
    expect(names.indexOf('base')).toBeLessThan(names.indexOf('dependent'))
  })

  it('transitive deps: a → b → c produces [a, b, c] order', () => {
    const a = makeManifest('a')
    const b = makeManifest('b', ['a'])
    const c = makeManifest('c', ['b'])
    const result = resolveLoadOrder([c, b, a])
    const names = result.map((r) => r.name)
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'))
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('c'))
  })

  it('direct circular dependency throws PluginCircularDependencyError', () => {
    const a = makeManifest('a', ['b'])
    const b = makeManifest('b', ['a'])
    expect(() => resolveLoadOrder([a, b])).toThrow(PluginCircularDependencyError)
  })

  it('self-dependency throws', () => {
    const self = makeManifest('self', ['self'])
    expect(() => resolveLoadOrder([self])).toThrow(PluginCircularDependencyError)
  })

  it('PluginCircularDependencyError is an Error', () => {
    const a = makeManifest('a', ['b'])
    const b = makeManifest('b', ['a'])
    try {
      resolveLoadOrder([a, b])
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect(e).toBeInstanceOf(PluginCircularDependencyError)
    }
  })

  it('diamond dependency resolves without duplication', () => {
    const base = makeManifest('base')
    const left = makeManifest('left', ['base'])
    const right = makeManifest('right', ['base'])
    const top = makeManifest('top', ['left', 'right'])
    const result = resolveLoadOrder([top, left, right, base])
    const names = result.map((r) => r.name)
    expect(names.filter((n) => n === 'base')).toHaveLength(1)
    expect(names.indexOf('base')).toBeLessThan(names.indexOf('left'))
    expect(names.indexOf('base')).toBeLessThan(names.indexOf('right'))
  })
})
