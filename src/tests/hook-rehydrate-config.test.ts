/*!
 * Tests for hooks/rehydrate.ts — configToHandler selection logic.
 *
 * configToHandler(config: HookHandlerConfig): HookHandler | null is pure
 * in its selection logic: returns null for non-shell kinds or missing command,
 * returns an async HookHandler function for valid shell configs.
 * No DB, no FS access at the selection level.
 *
 * Covers: non-shell kinds (inline-unsafe, module, mjs-module) return null,
 * shell without command returns null, valid shell returns function,
 * returned handler is a function, optional fields don't break selection.
 */

import { describe, it, expect } from 'vitest'
import { configToHandler } from '../core/hooks/rehydrate.js'
import type { HookHandlerConfig } from '../core/hooks/config-loader.js'

// ── helper ────────────────────────────────────────────────────────────────────

function shellConfig(overrides: Partial<HookHandlerConfig> = {}): HookHandlerConfig {
  return {
    id: 'test-hook',
    channel: 'task:post-complete',
    kind: 'shell',
    command: 'echo hello',
    ...overrides,
  }
}

// ── non-shell kinds return null ───────────────────────────────────────────────

describe('configToHandler — non-shell kinds', () => {
  it('returns null for kind=inline-unsafe', () => {
    const config = shellConfig({ kind: 'inline-unsafe', command: 'console.log("hi")' })
    expect(configToHandler(config)).toBeNull()
  })

  it('returns null for kind=module', () => {
    const config = shellConfig({ kind: 'module', command: './my-module.js' })
    expect(configToHandler(config)).toBeNull()
  })

  it('returns null for kind=mjs-module', () => {
    const config = shellConfig({ kind: 'mjs-module', command: './hook.mjs' })
    expect(configToHandler(config)).toBeNull()
  })
})

// ── shell without command returns null ────────────────────────────────────────

describe('configToHandler — shell missing command', () => {
  it('returns null when command is undefined', () => {
    const config = shellConfig({ command: undefined })
    expect(configToHandler(config)).toBeNull()
  })

  it('returns null when command is empty string', () => {
    const config = shellConfig({ command: '' })
    expect(configToHandler(config)).toBeNull()
  })
})

// ── valid shell returns HookHandler function ──────────────────────────────────

describe('configToHandler — valid shell', () => {
  it('returns a function for a valid shell config', () => {
    const handler = configToHandler(shellConfig())
    expect(typeof handler).toBe('function')
  })

  it('returns non-null for valid shell config', () => {
    const handler = configToHandler(shellConfig())
    expect(handler).not.toBeNull()
  })

  it('works with a different channel', () => {
    const config = shellConfig({ channel: 'session:start' })
    const handler = configToHandler(config)
    expect(handler).not.toBeNull()
  })

  it('works with optional env field', () => {
    const config = shellConfig({ env: { MY_VAR: 'value' } })
    const handler = configToHandler(config)
    expect(handler).not.toBeNull()
    expect(typeof handler).toBe('function')
  })

  it('works with optional timeoutMs field', () => {
    const config = shellConfig({ timeoutMs: 30000 })
    const handler = configToHandler(config)
    expect(handler).not.toBeNull()
  })

  it('works with optional commandArgs field', () => {
    const config = shellConfig({ commandArgs: ['--flag', '--verbose'] })
    const handler = configToHandler(config)
    expect(handler).not.toBeNull()
    expect(typeof handler).toBe('function')
  })

  it('returns same result for configs with identical id and command', () => {
    const h1 = configToHandler(shellConfig({ id: 'hook-a', command: 'echo a' }))
    const h2 = configToHandler(shellConfig({ id: 'hook-a', command: 'echo a' }))
    // Both must be functions (separate closures, so not ===, but both truthy)
    expect(h1).not.toBeNull()
    expect(h2).not.toBeNull()
  })
})
