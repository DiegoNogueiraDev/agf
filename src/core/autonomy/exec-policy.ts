/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_fbd1bc7467c3 — Exec-policy: decisão declarativa allow/deny/ask para
 * comandos de shell no loop autônomo. Inspirado no `execpolicy` do Codex CLI.
 *
 * Regras explícitas (prefixo, match mais longo vence) têm precedência; sem
 * regra, uma lista built-in de comandos perigosos sempre nega; senão aplica o
 * `defaultEffect`. Pura e determinística — endurece o guardrail do autopilot.
 */

import { is_dangerous_command } from '../security/shell-safety-classifier.js'

export type ExecEffect = 'allow' | 'deny' | 'ask'

export interface ExecRule {
  /** Prefixo do comando (ex.: "npm", "git push"). */
  match: string
  effect: ExecEffect
}

export interface ExecDecision {
  effect: ExecEffect
  matchedRule?: ExecRule
  /** true quando a negação veio da lista built-in de comandos perigosos. */
  builtin?: boolean
}

/** Padrões perigosos sempre negados quando nenhuma regra explícita casa. */
export const DEFAULT_DENY: readonly string[] = [
  'rm -rf',
  'sudo ',
  'git push --force',
  'git push -f',
  'chmod -R 777',
  'chmod 777',
  'dd if=',
  ':(){',
  'mkfs',
  '| sh',
  '|sh',
  '| bash',
  '> /dev/sd',
]

function norm(cmd: string): string {
  return cmd.trim().replace(/\s+/g, ' ')
}

/** True quando o comando casa a lista built-in de perigosos (classifier + DEFAULT_DENY legado). */
function isBuiltinDangerous(cmd: string): boolean {
  // Enhanced safety check via shell-safety-classifier (task-shell-safety)
  if (is_dangerous_command(cmd)) return true
  // Fallback to legacy DEFAULT_DENY for patterns not yet in classifier
  const low = cmd.toLowerCase()
  for (const danger of DEFAULT_DENY) {
    if (low.includes(danger)) return true
  }
  return false
}

/** Avalia a política para um comando. Match explícito mais longo vence. */
export function evaluateExecPolicy(
  command: string,
  rules: ExecRule[],
  defaultEffect: ExecEffect = 'ask',
): ExecDecision {
  const cmd = norm(command)

  let best: ExecRule | undefined
  for (const rule of rules) {
    const m = norm(rule.match)
    // Word-boundary match only: a `git` rule must not match `gitfoo`.
    if (cmd === m || cmd.startsWith(m + ' ')) {
      if (!best || m.length > norm(best.match).length) best = rule
    }
  }

  // Deny wins: a built-in dangerous command is denied even when an explicit
  // `allow` rule matched it — an allow rule must never re-enable a destructive command.
  const dangerous = isBuiltinDangerous(cmd)

  if (best) {
    if (best.effect === 'allow' && dangerous) return { effect: 'deny', builtin: true }
    return { effect: best.effect, matchedRule: best }
  }

  if (dangerous) return { effect: 'deny', builtin: true }

  return { effect: defaultEffect }
}

/** Cache de aprovações por sessão (aprova-1x). Chave normalizada. */
export class ApprovalCache {
  private readonly approved = new Set<string>()

  approveForSession(command: string): void {
    this.approved.add(norm(command))
  }

  isApproved(command: string): boolean {
    return this.approved.has(norm(command))
  }
}

/** Resultado mínimo de execução (compatível com CommandResult do executor). */
export interface GuardedCommandResult {
  exitCode: number
  output: string
}

export interface GuardExecOptions {
  rules?: ExecRule[]
  defaultEffect?: ExecEffect
  cache?: ApprovalCache
}

/**
 * Envolve um runner de comando com a política: `deny` (ou `ask` sem aprovação)
 * NÃO executa e retorna exitCode 126 com motivo; `allow` (ou `ask` aprovado)
 * delega ao runner base.
 */
export function guardExecRunner(
  base: (command: string, cwd: string) => GuardedCommandResult,
  opts: GuardExecOptions = {},
): (command: string, cwd: string) => GuardedCommandResult {
  const rules = opts.rules ?? []
  const defaultEffect = opts.defaultEffect ?? 'ask'
  return (command, cwd) => {
    const decision = evaluateExecPolicy(command, rules, defaultEffect)
    const allowed =
      decision.effect === 'allow' || (decision.effect === 'ask' && opts.cache?.isApproved(command) === true)
    if (allowed) return base(command, cwd)
    const reason =
      decision.effect === 'deny'
        ? decision.builtin
          ? 'deny (built-in perigoso)'
          : 'deny (regra)'
        : 'ask (não aprovado nesta sessão)'
    return { exitCode: 126, output: `[exec-policy] comando bloqueado — ${reason}: ${command}` }
  }
}
