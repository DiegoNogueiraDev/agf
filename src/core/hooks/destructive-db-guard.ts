/* eslint-disable security/detect-unsafe-regex */
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §SprintE.5 — Destructive DB Guard.
 *
 * Lint exemption note: the rm/DROP/PT-BR patterns below intentionally use
 * nested optional groups to cover variants ("rm -rf", "rm -fR", "apague o
 * banco", etc.). All inner character classes are explicitly bounded
 * ({0,10} / {0,5}) and prompt input is already size-capped upstream, so
 * the ReDoS class the rule is designed to prevent is not reachable here.
 *
 * The mcp-graph store (`workflow-graph/graph.db` and the surrounding
 * `workflow-graph/` directory) is the project's single source of truth.
 * Wiping it loses every node, edge, decision, traceability link, and
 * lessons-learned bucket — there is no undo. This guard scans prompts and
 * tool inputs for destructive intents BEFORE the agent acts on them.
 *
 * Pure decision module: no I/O, no side effects. Returns a verdict that
 * the hook layer wires to a block + user-confirmation flow.
 */

/**
 * Confirmation phrase the human must type back to authorize destruction.
 * Deliberately verbose, in PT-BR, with mixed-case and spaces — autocomplete
 * will not produce it accidentally.
 */
export const DESTRUCTIVE_DB_CONFIRM_PHRASE = 'CONFIRMO APAGAR mcp-graph'

export interface DestructiveDbVerdict {
  readonly blocked: boolean
  readonly reason: string | null
  readonly matchedPattern: string | null
}

const SAFE: DestructiveDbVerdict = { blocked: false, reason: null, matchedPattern: null }

/**
 * Patterns that match shell/SQL/CLI destructive intents against the store.
 * Each entry: [regex, human-readable label].
 */
const DESTRUCTIVE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Shell: rm targeting graph.db (more specific — must come before workflow-graph/)
  // Bounded character classes ({0,10}) prevent ReDoS catastrophic backtracking.
  [/\brm\s+(?:-[a-zA-Z]{0,10}\s+)?(?:\.\/)?workflow-graph\/graph\.db\b/i, 'rm graph.db'],
  // Shell: rm targeting workflow-graph/
  [
    /\brm\s+(?:-[a-zA-Z]{0,5}r[a-zA-Z]{0,5}\s+)?(?:-[a-zA-Z]{0,5}f[a-zA-Z]{0,5}\s+)?(?:\.\/)?workflow-graph(\/|\b)/i,
    'rm workflow-graph',
  ],
  // Shell: rm -rf with workflow-graph anywhere on the line
  [/\brm\s+-[a-zA-Z]{0,5}rf?[a-zA-Z]{0,5}\s+.{0,200}workflow-graph/i, 'rm -rf with workflow-graph'],
  // SQL: drop or delete-all on canonical mcp-graph tables
  [
    /\bDROP\s+TABLE\s+(IF\s+EXISTS\s+)?(nodes|edges|knowledge_documents|_migrations|decisions|lessons_learned)\b/i,
    'DROP TABLE on mcp-graph table',
  ],
  [
    /\bDELETE\s+FROM\s+(nodes|edges|knowledge_documents|_migrations|decisions|lessons_learned)\s*(;|$|--)/i,
    'DELETE FROM mcp-graph table without WHERE',
  ],
  [
    /\bTRUNCATE\s+(TABLE\s+)?(nodes|edges|knowledge_documents|_migrations|decisions|lessons_learned)\b/i,
    'TRUNCATE mcp-graph table',
  ],
  // CLI: init --force / --reset / --wipe variants
  [/\bmcp-graph\s+init\s+(--force|--reset|--wipe|-f\b)/i, 'mcp-graph init --force/--reset/--wipe'],
  // Natural-language intents (PT-BR + EN)
  [
    /\b(apag\w*|delet\w*|remov\w*|exclu\w*|limp\w*|zer[ae]\w*|reset\w*)\b[^.]{0,40}\b(banco|grafo|graph|workflow-graph|mcp-graph|database|db)\b/i,
    'PT-BR destructive intent against mcp-graph',
  ],
  [
    /\b(comec\w*|começ\w*)\s+(do\s+)?zero\b[^.]{0,40}\b(mcp-graph|workflow-graph|grafo|banco)\b/i,
    'começar do zero on mcp-graph',
  ],
  [
    /\b(wipe|nuke|destroy|drop\s+(the\s+)?(graph|db|database))\b[^.]{0,30}\b(mcp-graph|workflow-graph|graph)\b/i,
    'EN destructive intent against mcp-graph',
  ],
]

/**
 * Inspect a free-text prompt or shell command for destructive intent
 * against the mcp-graph store.
 *
 * @param text  prompt body, tool input command, or message content
 * @param confirmedPhrase  optional confirmation phrase the user typed back;
 *                         when it equals {@link DESTRUCTIVE_DB_CONFIRM_PHRASE}
 *                         the guard releases (one-shot bypass)
 */
export function checkDestructiveDbIntent(text: string, confirmedPhrase?: string | null): DestructiveDbVerdict {
  if (typeof text !== 'string' || text.length === 0) return SAFE

  // One-shot bypass: user typed the literal confirmation alongside the request.
  if (typeof confirmedPhrase === 'string' && confirmedPhrase.includes(DESTRUCTIVE_DB_CONFIRM_PHRASE)) {
    return SAFE
  }
  // Same bypass when the confirmation phrase appears INSIDE the prompt itself.
  if (text.includes(DESTRUCTIVE_DB_CONFIRM_PHRASE)) return SAFE

  for (const [re, label] of DESTRUCTIVE_PATTERNS) {
    if (re.test(text)) {
      return {
        blocked: true,
        matchedPattern: label,
        reason:
          `destructive-db-guard: detected "${label}" in prompt or tool input. ` +
          `The mcp-graph store is the project's source of truth and has no undo. ` +
          `If this is intentional, re-issue the request with the literal phrase: ` +
          `"${DESTRUCTIVE_DB_CONFIRM_PHRASE}".`,
      }
    }
  }

  return SAFE
}
