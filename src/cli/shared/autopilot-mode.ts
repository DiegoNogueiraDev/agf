/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Autopilot mode resolution — delegate vs live.
 *
 * delegate: external pilot (Claude/Copilot/Codex) drives agf; agf waits for agf submit.
 * live: agf calls its own LLM provider directly.
 *
 * Priority: --delegate flag > --live flag > env detection.
 * Delegate-first: when environment is already delegated, default to delegate mode.
 */

export type AutopilotMode = 'delegate' | 'live'

export interface AutopilotModeOpts {
  /** Explicit --delegate flag was set by the user. */
  delegate: boolean
  /** Explicit --live flag was set by the user. */
  live: boolean
  /** Whether the current environment is delegate-first (external pilot detected). */
  isEnvDelegated: boolean
}

/**
 * Resolves the effective autopilot mode from flags and environment.
 * --delegate always wins; --live without --delegate uses live; no flags defers to env.
 */
export function resolveAutopilotMode(opts: AutopilotModeOpts): AutopilotMode {
  if (opts.delegate) return 'delegate'
  if (opts.live) return 'live'
  return opts.isEnvDelegated ? 'delegate' : 'live'
}

const SUBMIT_SCHEMA = '\'{"arquivos":["<file>"],"testes":{"passed":N,"failed":0},"desvios":[]}\''

/**
 * Builds the "Aguardando pilot" message displayed when delegate mode is active.
 * Tells the external pilot exactly what command to run to close the loop.
 */
export function buildDelegateMessage(taskId?: string): string {
  const submitCmd = taskId
    ? `agf submit ${taskId} --result ${SUBMIT_SCHEMA}`
    : `agf submit <id> --result ${SUBMIT_SCHEMA}`

  return [`Aguardando pilot: implemente a task com seu LLM e feche o loop:`, `  ${submitCmd}`].join('\n')
}
