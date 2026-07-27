/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { HookSystem } from '../core/plugins/hook-system.js'
import { fireBeforeImport, fireAfterImport, importHookSystem } from '../core/plugins/import-hooks.js'

beforeEach(() => {
  // Isolate: clear any hooks registered by other tests on the shared system.
  ;(importHookSystem as unknown as { hooks: Map<unknown, unknown> }).hooks.clear()
})

describe('import hook points (T4.3)', () => {
  it('exposes before:import / after:import as valid hook points on a HookSystem', () => {
    const sys = new HookSystem()
    expect(() =>
      sys.registerHook({ pluginName: 'p', hookPoint: 'before:import', priority: 1, handler: () => {} }),
    ).not.toThrow()
    expect(() =>
      sys.registerHook({ pluginName: 'p', hookPoint: 'after:import', priority: 1, handler: () => {} }),
    ).not.toThrow()
  })

  // AC: GIVEN a before:import hook registered WHEN import runs THEN it fires and can abort
  it('fires before:import and lets a handler abort', async () => {
    let fired = false
    importHookSystem.registerHook({
      pluginName: 'guard',
      hookPoint: 'before:import',
      priority: 1,
      handler: (ctx) => {
        fired = true
        ctx.abort('blocked by policy')
      },
    })
    const res = await fireBeforeImport({ filePath: '/tmp/p.md' })
    expect(fired).toBe(true)
    expect(res.aborted).toBe(true)
    expect(res.abortReason).toBe('blocked by policy')
  })

  // AC: GIVEN an after:import hook registered WHEN import completes THEN it receives the result
  it('fires after:import with the import result', async () => {
    let seen: Record<string, unknown> | null = null
    importHookSystem.registerHook({
      pluginName: 'audit',
      hookPoint: 'after:import',
      priority: 1,
      handler: (ctx) => {
        seen = ctx.data
      },
    })
    await fireAfterImport({ filePath: '/tmp/p.md', nodes: 5, edges: 3 })
    expect(seen).toMatchObject({ filePath: '/tmp/p.md', nodes: 5, edges: 3 })
  })

  it('before:import with no handlers does not abort', async () => {
    const res = await fireBeforeImport({ filePath: '/tmp/p.md' })
    expect(res.aborted).toBe(false)
  })
})
