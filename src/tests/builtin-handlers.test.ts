/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { registerBuiltinHandlers, builtinHandlerIds } from '../core/hooks/builtin-handlers.js'
import { HookBus } from '../core/hooks/hook-bus.js'
import { GraphEventBus } from '../core/events/event-bus.js'

describe('registerBuiltinHandlers', () => {
  let bus: HookBus

  beforeEach(() => {
    vi.stubEnv('MCP_GRAPH_HOOKS_DISABLED', 'false')
    bus = new HookBus(new GraphEventBus())
  })

  it('registers handlers on expected channels', () => {
    registerBuiltinHandlers(bus)

    expect(bus.listenerCount('task:post-complete')).toBeGreaterThanOrEqual(1)
    expect(bus.listenerCount('task:error')).toBeGreaterThanOrEqual(1)
    expect(bus.listenerCount('tool:pre-call')).toBeGreaterThanOrEqual(1)
    expect(bus.listenerCount('tool:post-call')).toBeGreaterThanOrEqual(1)
    expect(bus.listenerCount('task:pre-execute')).toBeGreaterThanOrEqual(1)
    expect(bus.listenerCount('session:end')).toBeGreaterThanOrEqual(1)
  })

  it('registers approval:required and agent:pre-spawn handlers', () => {
    registerBuiltinHandlers(bus)

    expect(bus.listenerCount('approval:required')).toBeGreaterThanOrEqual(1)
    expect(bus.listenerCount('agent:pre-spawn')).toBeGreaterThanOrEqual(1)
    expect(bus.listenerCount('memory:pre-store')).toBeGreaterThanOrEqual(1)
  })

  it('wires the doc-sync-guard onto task:post-complete', () => {
    registerBuiltinHandlers(bus)
    expect(builtinHandlerIds).toContain('builtin:doc-sync-guard')
    // audit-log + doc-sync = at least 2 listeners on the channel
    expect(bus.listenerCount('task:post-complete')).toBeGreaterThanOrEqual(2)
  })

  it('is no-op when MCP_GRAPH_HOOKS_DISABLED is true', () => {
    vi.stubEnv('MCP_GRAPH_HOOKS_DISABLED', 'true')
    registerBuiltinHandlers(bus)

    expect(bus.listenerCount('task:post-complete')).toBe(0)
    expect(bus.listenerCount('tool:pre-call')).toBe(0)
  })
})

describe('builtinHandlerIds', () => {
  it('lists all expected builtin handler IDs', () => {
    expect(builtinHandlerIds).toContain('builtin:audit-log')
    expect(builtinHandlerIds).toContain('builtin:telemetry')
    expect(builtinHandlerIds).toContain('builtin:harness-regression')
    expect(builtinHandlerIds).toContain('builtin:anti-hallucination')
    expect(builtinHandlerIds).toContain('builtin:approval-required')
    expect(builtinHandlerIds).toContain('builtin:verified-auto-promote')
    expect(builtinHandlerIds).toContain('builtin:memory-pii-scanner')
    expect(builtinHandlerIds).toContain('builtin:wip-cap-guard')
    expect(builtinHandlerIds).toContain('builtin:agent-budget-precheck')
    expect(builtinHandlerIds).toContain('builtin:approval-timeout')
    expect(builtinHandlerIds).toContain('builtin:approval-slack')
    expect(builtinHandlerIds).toContain('builtin:destructive-db-guard')
    expect(builtinHandlerIds).toContain('builtin:citation-coverage-guard')
  })
})

describe('approval-slack-bridge integration (node_wire_e069c23ab792)', () => {
  let bus: HookBus
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.stubEnv('MCP_GRAPH_HOOKS_DISABLED', 'false')
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.test/webhook')
    vi.stubEnv('MCP_GRAPH_APPROVAL_SLACK', undefined)
    bus = new HookBus(new GraphEventBus())
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('posts to the Slack webhook when approval:required fires', async () => {
    registerBuiltinHandlers(bus)

    await bus.emit({
      channel: 'approval:required',
      timestamp: new Date().toISOString(),
      payload: {
        tool: 'Bash',
        severity: 'high',
        reason: 'rm -rf detected',
        matched: ['rm -rf'],
        nodeId: 'node_1',
      },
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://hooks.slack.test/webhook')
    const body = JSON.parse((init as { body: string }).body)
    expect(body.text).toContain('Bash')
  })

  it('does not post when MCP_GRAPH_APPROVAL_SLACK=off', async () => {
    vi.stubEnv('MCP_GRAPH_APPROVAL_SLACK', 'off')
    registerBuiltinHandlers(bus)

    await bus.emit({
      channel: 'approval:required',
      timestamp: new Date().toISOString(),
      payload: { tool: 'Bash', severity: 'high', reason: 'rm -rf detected' },
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('bash-validation-hook integration (node_wire_24f33bc942a2)', () => {
  let bus: HookBus
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubEnv('MCP_GRAPH_HOOKS_DISABLED', 'false')
    bus = new HookBus(new GraphEventBus())
    // HookBus.emit swallows every handler throw into a logged error (never
    // rejects the emit promise) — assert via the NDJSON log line on stderr,
    // not a rejection.
    errorSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('blocks a forbidden Bash command on tool:pre-call (logged, per HookBus swallow contract)', async () => {
    registerBuiltinHandlers(bus)

    await bus.emit({
      channel: 'tool:pre-call',
      timestamp: new Date().toISOString(),
      payload: { toolName: 'Bash', toolInput: { command: 'eval "$(cat foo)"' } },
    })

    const loggedForbidden = errorSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('bash:validation:forbidden')),
    )
    expect(loggedForbidden).toBe(true)
  })

  it('does not log a block for a safe Bash command', async () => {
    registerBuiltinHandlers(bus)

    await bus.emit({
      channel: 'tool:pre-call',
      timestamp: new Date().toISOString(),
      payload: { toolName: 'Bash', toolInput: { command: 'ls -la' } },
    })

    const loggedForbidden = errorSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('bash:validation:forbidden')),
    )
    expect(loggedForbidden).toBe(false)
  })

  it('ignores non-Bash tool calls', async () => {
    registerBuiltinHandlers(bus)

    await bus.emit({
      channel: 'tool:pre-call',
      timestamp: new Date().toISOString(),
      payload: { toolName: 'Read', toolInput: { file_path: '../../etc/passwd' } },
    })

    const loggedForbidden = errorSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('bash:validation:forbidden')),
    )
    expect(loggedForbidden).toBe(false)
  })
})
