/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Downward command dispatch — the architecture diagram's `comandos ↓` arrow.
 * The application sends a typed `SessionCommand` into the harness; the dispatcher
 * routes it, applies the immutable state change, and emits the matching upward
 * event. Pure aside from the bus emission; never mutates the input session.
 */

import type { HookBus } from '../hooks/hook-bus.js'
import type { PermissionMode } from '../worker-state/worker-state-schema.js'
import type { Session, SessionCommand } from '../../schemas/session.schema.js'
import { setMode } from './session-runtime.js'
import { emitModeChanged, emitToolApprovalRequired } from './session-events.js'
import { sessionMachine, transition, type StatechartState } from './session-statechart.js'

/**
 * Each PermissionMode is requested via its `SET_MODE_*` event in the
 * sessionMachine `mode` region. Single source of truth — the engine, not this
 * map, decides whether/where a transition lands (DRY: no parallel mode table).
 */
const MODE_EVENT: Record<PermissionMode, string> = {
  'read-only': 'SET_MODE_READONLY',
  'workspace-write': 'SET_MODE_WORKSPACE',
  'danger-full-access': 'SET_MODE_DANGER',
}

/**
 * Derive the next permission mode by seeding the statechart at `current`,
 * firing the requested mode event, and reading the `mode` region leaf. The
 * machine — not ad-hoc code — owns the transition rules; a request the current
 * state does not handle leaves the mode unchanged (the leaf stays `current`).
 */
function deriveMode(current: PermissionMode, requested: PermissionMode): PermissionMode {
  const seeded: StatechartState = { value: { mode: [current] }, history: {} }
  const next = transition(sessionMachine, seeded, { type: MODE_EVENT[requested] })
  const path = next.value.mode
  return path[path.length - 1] as PermissionMode
}

/**
 * Durable side-effects a command may produce, beyond the in-memory transition
 * and the upward event. Injected so dispatch stays testable; each hook is
 * optional (omit to keep a command event-only).
 */
export interface DispatchEffects {
  /** Persist the new permission mode (e.g. to worker-state). */
  persistMode?(mode: PermissionMode): void
  /** Resolve a pending approval (e.g. in session-state). */
  resolveApproval?(requestId: string): void
  /** Signal an interrupt to the agent loop. */
  signalInterrupt?(): void
}

/**
 * Dispatch a command against a session. Returns the (possibly new) session.
 * - set_mode      → new session with changed mode + `session:mode-changed`
 * - approve       → re-emits `approval:required` resolution; session unchanged
 * - interrupt     → session unchanged (signal only)
 * - send_message  → session unchanged (forwarded to the agent loop by caller)
 */
export async function dispatchCommand(
  session: Session,
  command: SessionCommand,
  bus: HookBus,
  effects?: DispatchEffects,
): Promise<Session> {
  switch (command.type) {
    case 'set_mode': {
      const derived = deriveMode(session.mode, command.mode)
      const next = setMode(session, derived)
      await emitModeChanged(bus, { from: session.mode, to: derived, sessionId: session.identity.sessionId })
      effects?.persistMode?.(derived)
      return next
    }
    case 'approve': {
      await emitToolApprovalRequired(bus, {
        resolution: 'approved',
        requestId: command.requestId,
        sessionId: session.identity.sessionId,
      })
      effects?.resolveApproval?.(command.requestId)
      return session
    }
    case 'interrupt': {
      effects?.signalInterrupt?.()
      return session
    }
    case 'send_message':
      return session
  }
}
