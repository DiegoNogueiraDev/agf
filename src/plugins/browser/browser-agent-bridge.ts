/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-RPA — Task 1.1: Adapter CLI agf to browser agent.
 *
 * Ponte FINA: o agf DIRIGE o browser agent (executor CDP, repo irmão) por
 * CLI/JSON (`browser-agent call <tool> '<json>'`). Não porta o browser agent para dentro
 * do agf — só invoca, parseia o envelope e mapeia erros. Guardrail: nada de
 * lógica de browser aqui; o agf NÃO pivota para ferramenta de RPA.
 *
 * O runner é injetável → testável sem o binário do browser agent instalado, e a ausência
 * do binário degrada graciosamente para `bridge_unreachable` (resiliência).
 */

import { execFileSync } from 'node:child_process'
import { BROWSER_PILOT_ERROR_CODES, type BrowserPilotErrorCode } from '../../schemas/browser-pilot.schema.js'

/** Resultado bruto de uma invocação do binário do browser agent. */
export interface RunnerResult {
  /** true quando o processo saiu 0. */
  ok: boolean
  stdout: string
  stderr: string
  /** Código de erro de spawn (ENOENT, ETIMEDOUT, SIGTERM…) quando ok=false. */
  spawnError?: string
}

/** Runner injetável — invoca `browser agent <args>` e devolve stdout/stderr. */
export type BrowserAgentRunner = (args: string[], opts: { timeoutMs: number }) => RunnerResult

/** Resultado tipado de uma chamada de tool, com erro mapeado para os 8 códigos estáveis. */
export type BrowserAgentCallResult<T = unknown> =
  { ok: true; data: T } | { ok: false; code: BrowserPilotErrorCode; error: string }

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Nome do executável do agente de browser, resolvido do ambiente.
 *
 * A ponte é agnóstica ao executor: qualquer CLI que aceite `<tool> '<json>'` e
 * responda com o envelope `{ ok, data | error }` serve. O binário NÃO é embutido
 * nem distribuído com o agf — quem quiser dirigir um browser aponta o seu aqui.
 * Ausente do PATH → `bridge_unreachable`, que é um estado previsto, não um crash.
 */
export const BROWSER_AGENT_BIN = process.env.AGF_BROWSER_AGENT_BIN ?? 'browser-agent'

/** Runner padrão: spawn síncrono de {@link BROWSER_AGENT_BIN}. Nunca lança — captura ENOENT/timeout. */
export const defaultRunner: BrowserAgentRunner = (args, opts) => {
  try {
    const stdout = execFileSync(BROWSER_AGENT_BIN, args, { encoding: 'utf8', timeout: opts.timeoutMs })
    return { ok: true, stdout, stderr: '' }
  } catch (err) {
    const e = err as {
      code?: string
      stdout?: string | Buffer
      stderr?: string | Buffer
      signal?: string
      message?: string
    }
    return {
      ok: false,
      stdout: typeof e.stdout === 'string' ? e.stdout : (e.stdout?.toString() ?? ''),
      stderr: typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString() ?? ''),
      spawnError: e.code ?? e.signal ?? e.message ?? 'unknown spawn error',
    }
  }
}

/** Detecta se o browser agent está disponível (binário no PATH respondendo a --version). */
export function isBrowserAgentAvailable(runner: BrowserAgentRunner = defaultRunner): boolean {
  return runner(['--version'], { timeoutMs: 5_000 }).ok
}

/** Mapeia a falha de spawn/stderr para um dos 8 códigos estáveis do browser-pilot. */
export function mapSpawnError(spawnError: string | undefined, stderr: string): BrowserPilotErrorCode {
  const s = `${spawnError ?? ''} ${stderr}`
  if (/ENOENT|not found|command not found|no such file/i.test(s)) return 'bridge_unreachable'
  if (/ETIMEDOUT|timed out|SIGTERM|SIGKILL/i.test(s)) return 'timeout'
  if (/cdp|devtools|websocket|ws:\/\//i.test(s)) return 'cdp_ws_unreachable'
  if (/quota|rate.?limit/i.test(s)) return 'quota_exceeded'
  if (/domain|blocked|forbidden/i.test(s)) return 'domain_blocked'
  return 'browser_use_crash'
}

/**
 * Invoca `browser-agent call <tool> '<json>'`, parseia o envelope JSON e devolve um
 * resultado tipado. Erros (binário ausente, timeout, CDP, crash) viram um dos 8
 * códigos estáveis — nunca lança.
 */
export function callBrowserAgent<T = unknown>(
  tool: string,
  args: Record<string, unknown> = {},
  opts: { runner?: BrowserAgentRunner; timeoutMs?: number } = {},
): BrowserAgentCallResult<T> {
  const runner = opts.runner ?? defaultRunner
  const res = runner(['call', tool, JSON.stringify(args)], { timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS })

  if (!res.ok) {
    return {
      ok: false,
      code: mapSpawnError(res.spawnError, res.stderr),
      error: res.stderr || res.spawnError || 'browser agent call failed',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(res.stdout.trim())
  } catch {
    return {
      ok: false,
      code: 'browser_use_crash',
      error: `unparseable browser agent output: ${res.stdout.slice(0, 200)}`,
    }
  }

  const env = (parsed ?? {}) as Record<string, unknown>
  if (env.ok === false) {
    const raw = typeof env.code === 'string' ? env.code : ''
    const code = (BROWSER_PILOT_ERROR_CODES as readonly string[]).includes(raw)
      ? (raw as BrowserPilotErrorCode)
      : 'browser_use_crash'
    return { ok: false, code, error: String(env.error ?? 'browser agent error') }
  }

  // Use presence of the `data` key — NOT `??` — so a legitimate `data: null`
  // (or false/0/"") is preserved instead of being clobbered by the whole envelope.
  // A raw envelope without a `data` wrapper falls back to the envelope itself.
  return { ok: true, data: ('data' in env ? env.data : env) as T }
}
