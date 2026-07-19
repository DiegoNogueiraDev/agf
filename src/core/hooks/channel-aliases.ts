/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { HookChannel } from './hook-types.js'

/**
 * Claude Code event names → mcp-graph hook channels.
 *
 * `null` means the Claude Code event has no analog in mcp-graph yet.
 * Importer skips those entries with an explicit log so users see the gap.
 */
export const CLAUDE_CODE_ALIASES = {
  PreToolUse: 'tool:pre-call',
  PostToolUse: 'tool:post-call',
  SessionStart: 'session:start',
  SessionEnd: 'session:end',
  Stop: 'task:post-complete',
  SubagentStop: 'agent:post-spawn',
  UserPromptSubmit: 'task:pre-execute',
  Notification: null,
  PreCompact: null,
} as const satisfies Record<string, HookChannel | null>

export type ClaudeCodeEvent = keyof typeof CLAUDE_CODE_ALIASES

const VALID_CHANNELS = new Set<HookChannel>([
  'session:start',
  'session:end',
  'agent:pre-spawn',
  'agent:post-spawn',
  'task:pre-execute',
  'task:post-complete',
  'task:error',
  'tool:pre-call',
  'tool:post-call',
  'memory:pre-store',
  'memory:post-store',
  'swarm:consensus-reached',
])

/**
 * Resolve either a Claude Code event name or a native mcp-graph channel
 * to the canonical mcp-graph channel. Returns null when the input has no
 * mapping (e.g. Notification, PreCompact, or an unknown string).
 */
export function resolveChannel(input: string): HookChannel | null {
  if (input in CLAUDE_CODE_ALIASES) {
    return CLAUDE_CODE_ALIASES[input as ClaudeCodeEvent]
  }
  if (VALID_CHANNELS.has(input as HookChannel)) return input as HookChannel
  return null
}
