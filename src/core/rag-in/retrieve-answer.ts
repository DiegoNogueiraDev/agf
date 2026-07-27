/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * One rule, kept in one place: below the confidence gate, RAG-IN has no command to offer.
 *
 * WHY it is a module and not an inline ternary: `retrieveCommand` returns both the verdict
 * (`decision`) and the best guess (`top`), and every caller that reads `top` without reading
 * `decision` republishes a rejected guess as an answer. The CLI did exactly that, and the AI
 * output profile then dropped `decision` from the envelope — so the agent received
 * `{"command":"agf immune"}` for "verify this AC", with nothing to suggest the engine had
 * refused at 0.200 against a 0.5 gate.
 *
 * Contract: `answeredCommand(result)` is the only sanctioned way to read a command out of a
 * decision. Null means: fall back to `agf help` or `agf <cmd> --help`, do not invent a flag.
 *
 * Composes with: retrieve.ts (produces the decision), cli/commands/retrieve-command-cmd.ts and
 * exec-cmd.ts (consume it).
 */

import type { RetrieveDecision } from './retrieve.js'

/** The command RAG-IN stands behind, or null when it does not stand behind one. */
export function answeredCommand(result: RetrieveDecision): string | null {
  if (result.decision === 'fallback_help') return null
  return result.top?.command ?? null
}

/**
 * `agf node rm` and `agf gc` are the commands you cannot take back. Matched by their last token
 * rather than by a flag, because that is how the surface names them.
 */
const DESTRUCTIVE_TAIL = new Set(['rm', 'gc', 'prune', 'reset', 'clear', 'purge', 'remove-peer'])

/** The words a person uses when they mean it. Portuguese and English, because the corpus is both. */
const DESTRUCTIVE_INTENT = new Set([
  'rm',
  'remove',
  'remover',
  'remova',
  'delete',
  'deletar',
  'apagar',
  'apaga',
  'excluir',
  'destruir',
  'arquivar',
  'archive',
  'limpar',
  'clear',
  'purge',
  'prune',
  'reset',
  'zerar',
  'drop',
])

function isDestructive(command: string): boolean {
  const tokens = command.split(/\s+/)
  const tail = tokens[tokens.length - 1] ?? ''
  return DESTRUCTIVE_TAIL.has(tail) || command.includes('--force') || command.includes('--reset')
}

function asksToDestroy(query: string): boolean {
  return query
    .toLowerCase()
    .split(/[^\p{L}0-9-]+/u)
    .some((token) => DESTRUCTIVE_INTENT.has(token))
}

/**
 * Demote a destructive suggestion that nobody asked for.
 *
 * "mostrar um nó do grafo" scored 0.667 against `agf node rm` — the words overlap almost
 * entirely, and lexical ranking cannot tell showing from archiving. The asymmetry decides it:
 * refusing costs one `--help`, obeying costs the node. So a destructive command only survives
 * when the query itself says destroy.
 *
 * Pure: returns a new decision, never mutates. A decision the confidence gate already rejected
 * passes through unchanged — this guard only ever removes an answer, never adds one.
 */
export function guardDecision(result: RetrieveDecision): RetrieveDecision {
  if (result.decision === 'fallback_help' || !result.top) return result
  if (!isDestructive(result.top.command) || asksToDestroy(result.query)) return result

  return {
    ...result,
    decision: 'fallback_help',
    top: null,
    fallback: `agf help  # refused: "${result.top.command}" is destructive and the intent did not ask for it`,
  }
}
