/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Command parsing and fuzzy matching — parseCommand, resolveAlias, fuzzyScore,
 * fuzzyFilter, filterCommands.
 * WHY here: parsing concerns separated from the catalog data and port interfaces.
 * Composing: re-exported via dispatch.ts barrel; also re-exported by
 * tui/slash/command-registry.ts.
 */

import { createLogger } from '../core/utils/logger.js'
import { COMMANDS, type SlashCommand } from './dispatch-catalog.js'

const log = createLogger({ layer: 'cli', source: 'tui/dispatch.ts' })

export interface ParsedCommand {
  cmd: string
  args: string
}

/** Parseia o input: `/cmd resto` → { cmd, args }. Sem '/' → cmd vazio. */
export function parseCommand(input: string): ParsedCommand {
  log.debug(`parseCommand: ${input.slice(0, 80)}`)
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return { cmd: '', args: trimmed }
  const body = trimmed.slice(1)
  const sp = body.indexOf(' ')
  if (sp === -1) return { cmd: body.toLowerCase(), args: '' }
  return { cmd: body.slice(0, sp).toLowerCase(), args: body.slice(sp + 1).trim() }
}

/** Resolve um alias para o nome canônico do comando. */
export function resolveAlias(candidate: string, commands: SlashCommand[]): string {
  const canonical = resolveAliasCanonical(candidate, commands)
  return canonical ? canonical.name : candidate
}

/** Retorna o SlashCommand canônico ou null se não for alias. */
function resolveAliasCanonical(candidate: string, commands: SlashCommand[]): SlashCommand | null {
  for (const cmd of commands) {
    if (cmd.name === candidate) return cmd
    if (cmd.aliases?.includes(candidate)) return cmd
  }
  return null
}

/**
 * Pontua um casamento fuzzy de `query` (subsequência) em `text`. Retorna `null`
 * quando não casa. Menor pontuação = melhor (casamento mais cedo/contíguo).
 * §node_14a5e0d6637b — inspirado no autocomplete do opencode.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (q === '') return 0
  let qi = 0
  let score = 0
  let lastMatch = -1
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // penaliza início tardio (ti no 1º match) e lacunas entre matches.
      if (lastMatch === -1) score += ti
      else score += ti - lastMatch - 1
      lastMatch = ti
      qi++
    }
  }
  return qi === q.length ? score : null
}

/**
 * Filtra+ordena comandos por casamento fuzzy do nome contra a query. Query vazia
 * devolve todos na ordem original (estável). §node_14a5e0d6637b
 */
export function fuzzyFilter(query: string, commands: SlashCommand[]): SlashCommand[] {
  if (query.trim() === '') return [...commands]
  const scored: Array<{ cmd: SlashCommand; score: number; idx: number }> = []
  commands.forEach((cmd, idx) => {
    let score = fuzzyScore(query, cmd.name)
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        const aliasScore = fuzzyScore(query, alias)
        if (aliasScore !== null && (score === null || aliasScore < score)) {
          score = aliasScore
        }
      }
    }
    if (score !== null) scored.push({ cmd, score, idx })
  })
  scored.sort((a, b) => (a.score !== b.score ? a.score - b.score : a.idx - b.idx))
  return scored.map((s) => s.cmd)
}

/** Comandos cujo nome casa (fuzzy) o que foi digitado após '/' (paleta). */
export function filterCommands(input: string, extra: SlashCommand[] = []): SlashCommand[] {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return []
  const query = trimmed.slice(1).split(' ')[0]
  return fuzzyFilter(query, [...COMMANDS, ...extra])
}
