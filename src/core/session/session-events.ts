/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Session upward events — the three application-facing events from the harness
 * diagram: message_update, mode_changed, tool_approval_required.
 *
 * Channel mapping (see HOOK_CHANNELS in ../hooks/hook-types.ts):
 *   message_update          → 'session:message-update' (new)
 *   mode_changed            → 'session:mode-changed'   (new)
 *   tool_approval_required  → 'approval:required'      (REUSED — already emitted
 *                             by builtin-handlers and consumed by the Slack
 *                             bridge / timeout escalator; duplicating it would
 *                             fork the approval audit trail).
 */

import type { HookBus } from '../hooks/hook-bus.js'
import type { HookHandler } from '../hooks/hook-types.js'
import type { PermissionMode } from '../worker-state/worker-state-schema.js'

function nowIso(): string {
  return new Date().toISOString()
}

/** Emit a message-update event (a new LLM response or tool result is available). */
export async function emitMessageUpdate(bus: HookBus, payload: Record<string, unknown>): Promise<void> {
  await bus.emit({ channel: 'session:message-update', timestamp: nowIso(), payload })
}

/** Emit a mode-changed event when the session's permission mode transitions. */
export async function emitModeChanged(
  bus: HookBus,
  args: { from: PermissionMode; to: PermissionMode; sessionId: string },
): Promise<void> {
  await bus.emit({ channel: 'session:mode-changed', timestamp: nowIso(), payload: { ...args } })
}

/**
 * Emit a tool-approval-required event. Delegates to the existing
 * 'approval:required' channel — there is deliberately no separate
 * 'tool-approval-required' channel.
 */
export async function emitToolApprovalRequired(bus: HookBus, payload: Record<string, unknown>): Promise<void> {
  await bus.emit({ channel: 'approval:required', timestamp: nowIso(), payload })
}

/**
 * Bridge: re-emit a `session:message-update` whenever an `llm:post-call` fires.
 * Returns the registered handler so callers can `bus.off('llm:post-call', h)`.
 */
export function installMessageUpdateBridge(bus: HookBus): HookHandler {
  const handler: HookHandler = async (event) => {
    await emitMessageUpdate(bus, { source: 'llm:post-call', ...event.payload })
  }
  bus.on('llm:post-call', handler)
  return handler
}
