/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { ToolLifecycleHooks } from '../core/hooks/tool-lifecycle-hooks.js'
import type { ToolHookConfig, HookResult, ToolHookShellFn } from '../core/hooks/tool-lifecycle-hooks.js'

function mockShellFn(results: HookResult[]): ToolHookShellFn {
  let callIndex = 0
  return async () => {
    const result = results[callIndex] ?? { allow: true }
    callIndex++
    return result
  }
}

describe('ToolLifecycleHooks', () => {
  it('register adds a hook config', () => {
    const shell = vi.fn()
    const hooks = new ToolLifecycleHooks(shell)
    const config: ToolHookConfig = { tool: 'Bash', event: 'PreToolUse', command: 'echo "ok"' }
    hooks.register(config)
  })

  it('runPreToolUse returns allow:true when no hooks match', async () => {
    const hooks = new ToolLifecycleHooks(vi.fn())
    const result = await hooks.runPreToolUse('Bash', { command: 'ls' })
    expect(result.allow).toBe(true)
  })

  it('runPreToolUse returns allow:false when a hook denies', async () => {
    const shell = mockShellFn([{ allow: false }])
    const hooks = new ToolLifecycleHooks(shell)
    hooks.register({ tool: 'Bash', event: 'PreToolUse', command: 'deny' })

    const result = await hooks.runPreToolUse('Bash', { command: 'rm -rf' })
    expect(result.allow).toBe(false)
  })

  it('runPreToolUse returns updatedInput when hook provides it', async () => {
    const shell = mockShellFn([{ allow: true, updatedInput: { command: 'ls -la' } }])
    const hooks = new ToolLifecycleHooks(shell)
    hooks.register({ tool: 'Bash', event: 'PreToolUse', command: 'modify' })

    const result = await hooks.runPreToolUse('Bash', { command: 'ls' })
    expect(result.allow).toBe(true)
    expect(result.updatedInput).toEqual({ command: 'ls -la' })
  })

  it('runPreToolUse matches wildcard "*" tool', async () => {
    const shell = mockShellFn([{ allow: true }])
    const hooks = new ToolLifecycleHooks(shell)
    hooks.register({ tool: '*', event: 'PreToolUse', command: 'check' })

    const result = await hooks.runPreToolUse('AnyTool', {})
    expect(result.allow).toBe(true)
  })

  it('runPreToolUse does NOT match hooks for different tool', async () => {
    const shell = vi.fn()
    const hooks = new ToolLifecycleHooks(shell)
    hooks.register({ tool: 'Bash', event: 'PreToolUse', command: 'check' })

    const result = await hooks.runPreToolUse('Read', {})
    expect(result.allow).toBe(true)
    expect(shell).not.toHaveBeenCalled()
  })

  it('runPreToolUse only matches PreToolUse events', async () => {
    const shell = vi.fn()
    const hooks = new ToolLifecycleHooks(shell)
    hooks.register({ tool: '*', event: 'PostToolUse', command: 'check' })

    const result = await hooks.runPreToolUse('Bash', {})
    expect(result.allow).toBe(true)
    expect(shell).not.toHaveBeenCalled()
  })

  it('runPostToolUse runs hooks and always returns allow:true', async () => {
    const shell = mockShellFn([{ allow: false }])
    const hooks = new ToolLifecycleHooks(shell)
    hooks.register({ tool: '*', event: 'PostToolUse', command: 'check' })

    const result = await hooks.runPostToolUse('Bash', { status: 'ok' })
    expect(result.allow).toBe(true)
  })

  it('runPostToolUseFailure does not throw on shell error', async () => {
    const shell = vi.fn().mockRejectedValue(new Error('shell failed'))
    const hooks = new ToolLifecycleHooks(shell)
    hooks.register({ tool: '*', event: 'PostToolUseFailure', command: 'check' })

    await expect(hooks.runPostToolUseFailure('Bash', new Error('tool failed'))).resolves.toBeUndefined()
  })

  it('shell failure in runPreToolUse is advisory and continues', async () => {
    const shell = vi.fn().mockRejectedValue(new Error('shell crash'))
    const hooks = new ToolLifecycleHooks(shell)
    hooks.register({ tool: '*', event: 'PreToolUse', command: 'check' })

    const result = await hooks.runPreToolUse('Bash', {})
    expect(result.allow).toBe(true)
  })

  it('first allow:false short-circuits remaining hooks', async () => {
    const shell = mockShellFn([{ allow: true }, { allow: false }, { allow: true }])
    const hooks = new ToolLifecycleHooks(shell)
    hooks.register({ tool: '*', event: 'PreToolUse', command: 'h1', timeoutMs: 100 })
    hooks.register({ tool: '*', event: 'PreToolUse', command: 'h2', timeoutMs: 100 })
    hooks.register({ tool: '*', event: 'PreToolUse', command: 'h3', timeoutMs: 100 })

    const result = await hooks.runPreToolUse('Bash', {})
    expect(result.allow).toBe(false)
  })

  it('collects warnings from all matching hooks', async () => {
    const shell = mockShellFn([
      { allow: true, warnings: ['warn1'] },
      { allow: true, warnings: ['warn2'] },
    ])
    const hooks = new ToolLifecycleHooks(shell)
    hooks.register({ tool: '*', event: 'PreToolUse', command: 'h1' })
    hooks.register({ tool: '*', event: 'PreToolUse', command: 'h2' })

    const result = await hooks.runPreToolUse('Bash', {})
    expect(result.allow).toBe(true)
    expect(result.warnings).toEqual(['warn1', 'warn2'])
  })
})
