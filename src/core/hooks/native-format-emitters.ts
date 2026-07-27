/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §HOOKS-MULTI-CLI-INTEGRATION-PRD — bidirectional hook export.
 * Pure transformers: take a canonical mcp-graph HookSpec[] and emit the
 * equivalent native config for Codex, OpenCode, or Copilot.
 *
 * Format names use the convention: `${cli}-${event}-${index}` so the
 * round-trip from native → canonical → native preserves identifiers.
 */

export type CanonicalEvent = 'pretooluse' | 'posttooluse' | 'notification' | 'stop' | 'subagent-stop'

export type SupportedCli = 'codex' | 'opencode' | 'copilot'

export interface CanonicalHookSpec {
  id: string
  cli: SupportedCli | 'claude' | 'cursor' | 'aider' | 'continue' | 'cline'
  event: CanonicalEvent
  matcher?: string
  command: string
}

export interface CodexHookFile {
  hooks: Array<{
    name: string
    event: string
    matcher?: string
    run: string
  }>
}

export interface OpenCodeHookFile {
  triggers: Array<{
    id: string
    on: string
    pattern?: string
    exec: string
  }>
}

export interface CopilotHookFile {
  hooks: Array<{
    id: string
    event: string
    matcher?: string
    command: string
  }>
}

function filterByCli(specs: CanonicalHookSpec[], cli: SupportedCli): CanonicalHookSpec[] {
  return specs.filter((s) => s.cli === cli)
}

const CODEX_EVENT: Record<CanonicalEvent, string> = {
  pretooluse: 'pre_tool',
  posttooluse: 'post_tool',
  notification: 'notification',
  stop: 'stop',
  'subagent-stop': 'subagent_stop',
}

const OPENCODE_EVENT: Record<CanonicalEvent, string> = {
  pretooluse: 'before_tool',
  posttooluse: 'after_tool',
  notification: 'notify',
  stop: 'session_stop',
  'subagent-stop': 'subagent_stop',
}

const COPILOT_EVENT: Record<CanonicalEvent, string> = {
  pretooluse: 'PreToolUse',
  posttooluse: 'PostToolUse',
  notification: 'Notification',
  stop: 'Stop',
  'subagent-stop': 'SubagentStop',
}

/** emitCodex —  */
export function emitCodex(specs: CanonicalHookSpec[]): CodexHookFile {
  return {
    hooks: filterByCli(specs, 'codex').map((s) => ({
      name: s.id,
      event: CODEX_EVENT[s.event],
      ...(s.matcher !== undefined ? { matcher: s.matcher } : {}),
      run: s.command,
    })),
  }
}

/** emitOpenCode —  */
export function emitOpenCode(specs: CanonicalHookSpec[]): OpenCodeHookFile {
  return {
    triggers: filterByCli(specs, 'opencode').map((s) => ({
      id: s.id,
      on: OPENCODE_EVENT[s.event],
      ...(s.matcher !== undefined ? { pattern: s.matcher } : {}),
      exec: s.command,
    })),
  }
}

/** emitCopilot —  */
export function emitCopilot(specs: CanonicalHookSpec[]): CopilotHookFile {
  return {
    hooks: filterByCli(specs, 'copilot').map((s) => ({
      id: s.id,
      event: COPILOT_EVENT[s.event],
      ...(s.matcher !== undefined ? { matcher: s.matcher } : {}),
      command: s.command,
    })),
  }
}

export type NativeFormat = 'codex' | 'opencode' | 'copilot'

/** Dispatch helper for the `hooks list --format=<provider>` CLI flag. */
export function emitNative(
  specs: CanonicalHookSpec[],
  format: NativeFormat,
): CodexHookFile | OpenCodeHookFile | CopilotHookFile {
  switch (format) {
    case 'codex':
      return emitCodex(specs)
    case 'opencode':
      return emitOpenCode(specs)
    case 'copilot':
      return emitCopilot(specs)
  }
}
