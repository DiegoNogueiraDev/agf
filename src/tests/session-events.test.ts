/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { HookBus } from '../core/hooks/hook-bus.js'
import { GraphEventBus } from '../core/events/event-bus.js'
import { HookChannelSchema, UnknownHookChannelError, assertHookChannel } from '../core/hooks/hook-types.js'
import {
  emitModeChanged,
  emitToolApprovalRequired,
  installMessageUpdateBridge,
} from '../core/session/session-events.js'

function freshBus(): HookBus {
  return new HookBus(new GraphEventBus())
}

describe('session event channels', () => {
  it('registers session:message-update and session:mode-changed as valid channels', () => {
    expect(HookChannelSchema.safeParse('session:message-update').success).toBe(true)
    expect(HookChannelSchema.safeParse('session:mode-changed').success).toBe(true)
  })

  it('still throws UnknownHookChannelError for an unknown channel', () => {
    expect(() => assertHookChannel('session:does-not-exist')).toThrow(UnknownHookChannelError)
  })
})

describe('installMessageUpdateBridge', () => {
  it('emits exactly one session:message-update per llm:post-call', async () => {
    const bus = freshBus()
    let count = 0
    bus.on('session:message-update', async () => {
      count += 1
    })
    installMessageUpdateBridge(bus)
    await bus.emit({ channel: 'llm:post-call', timestamp: new Date().toISOString(), payload: { tokens: 10 } })
    expect(count).toBe(1)
  })
})

describe('emitModeChanged', () => {
  it('fires session:mode-changed with from/to', async () => {
    const bus = freshBus()
    let received: Record<string, unknown> | null = null
    bus.on('session:mode-changed', async (event) => {
      received = event.payload
    })
    await emitModeChanged(bus, { from: 'workspace-write', to: 'read-only', sessionId: 'sess_1' })
    expect(received).toMatchObject({ from: 'workspace-write', to: 'read-only', sessionId: 'sess_1' })
  })
})

describe('emitToolApprovalRequired', () => {
  it('delegates to the existing approval:required channel (no new channel)', async () => {
    const bus = freshBus()
    let approvals = 0
    bus.on('approval:required', async () => {
      approvals += 1
    })
    await emitToolApprovalRequired(bus, { tool: 'bash', severity: 'high', reason: 'rm -rf' })
    expect(approvals).toBe(1)
    expect(HookChannelSchema.safeParse('tool-approval-required').success).toBe(false)
  })
})
