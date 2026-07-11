/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { HookBus } from '../core/hooks/hook-bus.js'
import { GraphEventBus } from '../core/events/event-bus.js'
import { SessionCommandSchema, type Session } from '../schemas/session.schema.js'
import { dispatchCommand } from '../core/session/session-command.js'

function freshBus(): HookBus {
  return new HookBus(new GraphEventBus())
}

const session: Session = {
  identity: { sessionId: 'sess_1', workerId: 'w1', agentRole: 'implementor', workspace: '/ws' },
  thread: { id: 'thr_1', model: 'sonnet', modelProvider: 'anthropic', cwd: '/ws', agentRole: 'implementor' },
  mode: 'workspace-write',
  model: { id: 'sonnet', provider: 'anthropic' },
  run: null,
  grants: [],
}

describe('SessionCommandSchema', () => {
  it('validates a set_mode command', () => {
    expect(SessionCommandSchema.safeParse({ type: 'set_mode', mode: 'read-only' }).success).toBe(true)
  })

  it('validates approve / interrupt / send_message', () => {
    expect(SessionCommandSchema.safeParse({ type: 'approve', requestId: 'r1' }).success).toBe(true)
    expect(SessionCommandSchema.safeParse({ type: 'interrupt' }).success).toBe(true)
    expect(SessionCommandSchema.safeParse({ type: 'send_message', text: 'hi' }).success).toBe(true)
  })

  it('rejects an unknown command type', () => {
    expect(SessionCommandSchema.safeParse({ type: 'self_destruct' }).success).toBe(false)
  })
})

describe('dispatchCommand', () => {
  it('set_mode returns a new session with changed mode and emits session:mode-changed', async () => {
    const bus = freshBus()
    let modeEvents = 0
    bus.on('session:mode-changed', async () => {
      modeEvents += 1
    })
    const next = await dispatchCommand(session, { type: 'set_mode', mode: 'read-only' }, bus)
    expect(next.mode).toBe('read-only')
    expect(session.mode).toBe('workspace-write') // immutable
    expect(next).not.toBe(session)
    expect(modeEvents).toBe(1)
  })

  it('interrupt leaves the session unchanged', async () => {
    const bus = freshBus()
    const next = await dispatchCommand(session, { type: 'interrupt' }, bus)
    expect(next).toEqual(session)
  })
})

describe('dispatchCommand — set_mode derived via sessionMachine statechart', () => {
  const readOnly: Session = { ...session, mode: 'read-only' }

  it('derives danger-full-access from the mode region leaf and emits mode-changed once', async () => {
    const bus = freshBus()
    const events: Array<{ from: string; to: string }> = []
    bus.on('session:mode-changed', async (e: unknown) => {
      const p = (e as { payload: { from: string; to: string } }).payload
      events.push({ from: p.from, to: p.to })
    })
    const next = await dispatchCommand(readOnly, { type: 'set_mode', mode: 'danger-full-access' }, bus)
    expect(next.mode).toBe('danger-full-access')
    expect(readOnly.mode).toBe('read-only') // input not mutated
    expect(events).toEqual([{ from: 'read-only', to: 'danger-full-access' }])
  })

  it('the machine decides every transition across a 3-mode round-trip', async () => {
    const bus = freshBus()
    const a = await dispatchCommand(readOnly, { type: 'set_mode', mode: 'workspace-write' }, bus)
    expect(a.mode).toBe('workspace-write')
    const b = await dispatchCommand(a, { type: 'set_mode', mode: 'read-only' }, bus)
    expect(b.mode).toBe('read-only')
    const c = await dispatchCommand(b, { type: 'set_mode', mode: 'danger-full-access' }, bus)
    expect(c.mode).toBe('danger-full-access')
  })

  it('set_mode to the current mode returns a new immutable session with mode unchanged and persists the derived mode', async () => {
    const bus = freshBus()
    const modes: string[] = []
    const next = await dispatchCommand(readOnly, { type: 'set_mode', mode: 'read-only' }, bus, {
      persistMode: (m) => modes.push(m),
    })
    expect(next).not.toBe(readOnly) // new session
    expect(next.mode).toBe('read-only') // unchanged
    expect(readOnly.mode).toBe('read-only') // input not mutated
    expect(modes).toEqual(['read-only']) // persistence v2 intact, derived mode
  })
})

describe('dispatchCommand — durable effects', () => {
  it('calls persistMode with the new mode on set_mode', async () => {
    const bus = freshBus()
    const modes: string[] = []
    await dispatchCommand(session, { type: 'set_mode', mode: 'read-only' }, bus, {
      persistMode: (m) => modes.push(m),
    })
    expect(modes).toEqual(['read-only'])
  })

  it('calls resolveApproval with the requestId on approve', async () => {
    const bus = freshBus()
    const resolved: string[] = []
    await dispatchCommand(session, { type: 'approve', requestId: 'req-9' }, bus, {
      resolveApproval: (id) => resolved.push(id),
    })
    expect(resolved).toEqual(['req-9'])
  })

  it('calls signalInterrupt once on interrupt', async () => {
    const bus = freshBus()
    let interrupts = 0
    await dispatchCommand(session, { type: 'interrupt' }, bus, { signalInterrupt: () => (interrupts += 1) })
    expect(interrupts).toBe(1)
  })

  it('works without effects (optional, no throw)', async () => {
    const bus = freshBus()
    const next = await dispatchCommand(session, { type: 'set_mode', mode: 'read-only' }, bus)
    expect(next.mode).toBe('read-only')
  })
})
