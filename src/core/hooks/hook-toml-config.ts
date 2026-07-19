/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (Task 3.1) — loader de config TOML para hooks.
 * Surface declarativo estilo tool-compress: cada [[hook]] registra um handler num canal
 * via registerHook (Task 3.2). O handler roda um comando shell e mapeia o
 * exit-code para uma ação (protocolo 0=allow,1=passthrough,2=deny,3=ask).
 *
 * Nota: o ENFORCEMENT da ação (short-circuit em deny/halt) entra na camada de
 * dispatch da Fase 2; aqui o handler já produz o HookActionResult correto.
 */

import { parse } from 'smol-toml'
import { spawnSync } from 'node:child_process'
import { z } from 'zod/v4'
import { McpGraphError } from '../utils/errors.js'
import { registerHook } from './register-hook.js'
import { assertHookChannel, allow, deny, record } from './hook-types.js'
import type { HookActionResult, HookEvent } from './hook-types.js'
import { parseMatcher, matches, type MatcherAst } from './matcher.js'

/** Erro tipado de config TOML inválida. */
export class HookTomlConfigError extends McpGraphError {
  constructor(message: string) {
    super(`Invalid hook TOML config: ${message}`)
    this.name = 'HookTomlConfigError'
  }
}

export const HookTomlEntrySchema = z.object({
  channel: z.string().min(1),
  command: z.string().min(1),
  priority: z.number().int().optional(),
  timeoutMs: z.number().int().positive().optional(),
  /** Optional matcher.ts filter clause, e.g. "toolName:Bash" or "durationMs:>1000". */
  matcher: z.string().min(1).optional(),
})

export type HookTomlEntry = z.infer<typeof HookTomlEntrySchema>

export const HookTomlConfigSchema = z.object({
  hook: z.array(HookTomlEntrySchema).default([]),
})

export type HookTomlConfig = z.infer<typeof HookTomlConfigSchema>

/**
 * Parseia + valida uma string TOML de config de hooks. Lança HookTomlConfigError
 * em TOML/schema inválido e UnknownHookChannelError em canal desconhecido.
 */
export function parseHookTomlConfig(toml: string): HookTomlConfig {
  let raw: unknown
  try {
    raw = parse(toml)
  } catch (err) {
    throw new HookTomlConfigError(err instanceof Error ? err.message : String(err))
  }
  const result = HookTomlConfigSchema.safeParse(raw)
  if (!result.success) {
    throw new HookTomlConfigError(result.error.issues.map((i) => i.message).join('; '))
  }
  // Valida cada canal (throw tipado se desconhecido) e, se houver, a sintaxe do matcher.
  for (const entry of result.data.hook) {
    assertHookChannel(entry.channel)
    if (entry.matcher !== undefined) {
      try {
        parseMatcher(`${entry.channel}(${entry.matcher})`)
      } catch (err) {
        throw new HookTomlConfigError(err instanceof Error ? err.message : String(err))
      }
    }
  }
  return result.data
}

/**
 * Mapeia o exit-code do comando para uma ação (protocolo tool-compress).
 * 0=allow, 1=passthrough (record/observa), 2=deny, 3=ask (escalação → deny
 * conservador pendente de humano), demais → record.
 */
export function exitCodeToAction(code: number, reason?: string): HookActionResult {
  switch (code) {
    case 0:
      return allow()
    case 1:
      return record()
    case 2:
      return deny(reason ?? 'denied (exit code 2)')
    case 3:
      return deny(reason ?? 'ask required (exit code 3)')
    default:
      return record()
  }
}

/** Runner de comando: recebe (command, event, timeoutMs) e retorna o exit-code. */
export type HookCommandRunner = (command: string, event: HookEvent, timeoutMs: number) => number

/** Runner default — executa o comando shell com o evento via JSON stdin. */
function defaultRunner(command: string, event: HookEvent, timeoutMs: number): number {
  const res = spawnSync(command, {
    shell: true,
    input: JSON.stringify(event),
    timeout: timeoutMs,
    encoding: 'utf8',
  })
  return typeof res.status === 'number' ? res.status : 1
}

export interface LoadHookTomlOptions {
  /** Runner injetável (default: spawn shell). */
  runner?: HookCommandRunner
}

export interface LoadHookTomlResult {
  count: number
  unregisterAll: () => void
}

/**
 * Carrega uma config TOML e registra um handler por [[hook]] via registerHook.
 * Cada handler roda o comando e produz o HookActionResult conforme o exit-code.
 */
export function loadHookTomlConfig(toml: string, opts: LoadHookTomlOptions = {}): LoadHookTomlResult {
  const cfg = parseHookTomlConfig(toml)
  const runner = opts.runner ?? defaultRunner
  const offs = cfg.hook.map((entry) => {
    // matcher.ts's parse+match was write-only data until now — this is its
    // first real reader. Re-parsed here (not cached from parseHookTomlConfig)
    // to keep entry validation and dispatch-time filtering independent.
    const matcherAst: MatcherAst | undefined =
      entry.matcher !== undefined ? parseMatcher(`${entry.channel}(${entry.matcher})`) : undefined
    return registerHook(
      entry.channel,
      (event: HookEvent): HookActionResult => {
        if (matcherAst && !matches(matcherAst, event)) return record()
        const code = runner(entry.command, event, entry.timeoutMs ?? 5000)
        return exitCodeToAction(code)
      },
      { priority: entry.priority },
    )
  })
  return {
    count: cfg.hook.length,
    unregisterAll: () => offs.forEach((off) => off()),
  }
}
