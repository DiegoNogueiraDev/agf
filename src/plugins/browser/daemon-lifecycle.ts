/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-RPA — Task 1.2: Lifecycle do daemon browser agent.
 *
 * Sobe o daemon persistente do browser agent (startup idempotente) antes de um cenário
 * e recupera de uma queda no meio: se uma chamada falha por CDP fora do ar
 * (cdp_ws_unreachable), reinicia o daemon 1x e re-tenta o passo. Resiliência.
 * Runner injetável → testável sem o binário. Só orquestra — não-pivota.
 */

import {
  callBrowserAgent,
  defaultRunner,
  type BrowserAgentRunner,
  type BrowserAgentCallResult,
} from './browser-agent-bridge.js'

const START_TIMEOUT_MS = 30_000

/** Sobe o daemon (startup idempotente do browser agent — seguro se já estiver no ar). */
export function ensureDaemon(runner: BrowserAgentRunner = defaultRunner): { ok: boolean } {
  return { ok: runner(['start'], { timeoutMs: START_TIMEOUT_MS }).ok }
}

/** Para o daemon. */
export function stopDaemon(runner: BrowserAgentRunner = defaultRunner): { ok: boolean } {
  return { ok: runner(['stop'], { timeoutMs: START_TIMEOUT_MS }).ok }
}

/**
 * Executa um tool com recuperação de daemon: se a 1ª chamada falhar por
 * `cdp_ws_unreachable` (daemon/CDP caiu), reinicia o daemon 1x e re-tenta.
 * Outros erros (ex.: bridge_unreachable = binário ausente) não disparam restart.
 */
export function callWithDaemonRetry<T = unknown>(
  tool: string,
  args: Record<string, unknown> = {},
  opts: { runner?: BrowserAgentRunner; timeoutMs?: number } = {},
): BrowserAgentCallResult<T> & { restarted: boolean } {
  const runner = opts.runner ?? defaultRunner
  const first = callBrowserAgent<T>(tool, args, opts)
  if (first.ok || first.code !== 'cdp_ws_unreachable') {
    return { ...first, restarted: false }
  }
  // Daemon/CDP caiu no meio → reinicia 1x e re-tenta o passo.
  runner(['start'], { timeoutMs: START_TIMEOUT_MS })
  const retry = callBrowserAgent<T>(tool, args, opts)
  return { ...retry, restarted: true }
}
