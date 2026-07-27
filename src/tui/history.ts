/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_b91483eb8799 — Recall puro de histórico de comandos (↑/↓).
 *
 * `cursor = -1` significa "no rascunho" (input atual não-submetido). Índices
 * 0..n-1 contam a partir do mais recente (último do array). ↑ vai para mais
 * antigo (clamp no fim); ↓ vai para mais novo, voltando ao rascunho no fim.
 * Inspirado em opencode `prompt-input/history.ts`.
 *
 * §6C.3 — Persistência em disco (saveHistory/loadHistory).
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/history.ts' })

export interface HistoryState {
  /** Comandos submetidos, do mais antigo (índice 0) ao mais novo (último). */
  history: string[]
  /** -1 = no rascunho; 0 = mais recente; cresce em direção ao mais antigo. */
  cursor: number
  /** Input não-submetido, restaurado ao sair do histórico por baixo. */
  draft: string
}

export interface HistoryNavResult {
  value: string
  cursor: number
}

/** Valor exibido para um dado cursor (cursor -1 → rascunho). */
function valueAt(state: HistoryState, cursor: number): string {
  if (cursor < 0) return state.draft
  return state.history[state.history.length - 1 - cursor]
}

/**
 * Navega o histórico. Pura: não muta `state`, retorna {value, cursor}.
 * "up" → comando mais antigo; "down" → mais novo / rascunho.
 */
export function navigateHistory(state: HistoryState, dir: 'up' | 'down'): HistoryNavResult {
  log.debug(`navigateHistory: ${dir}`)
  const last = state.history.length - 1
  if (last < 0) return { value: state.draft, cursor: -1 }

  let cursor = state.cursor
  if (dir === 'up') {
    cursor = Math.min(cursor + 1, last)
  } else {
    cursor = Math.max(cursor - 1, -1)
  }
  return { value: valueAt(state, cursor), cursor }
}

/**
 * `/provider connect <id> <key...>` carries a plaintext API key as its last
 * argument — history entries are persisted verbatim to disk (saveHistory), so
 * without this the key sits in ~/.local/share/agent-graph-flow/history.json
 * indefinitely. Strip it before the entry ever reaches setHistory/saveHistory.
 */
const PROVIDER_CONNECT_WITH_KEY = /^(\s*\/provider\s+connect\s+\S+\s+)(.+)$/i

/** Redacts a secret-bearing command before it is added to persisted history. */
export function redactHistoryEntry(entry: string): string {
  const match = entry.match(PROVIDER_CONNECT_WITH_KEY)
  if (!match) return entry
  return `${match[1]}[REDACTED]`
}

const HISTORY_MAX = 200

/** Salva histórico de comandos em disco como JSON. Cria diretório se necessário. */
export function saveHistory(commands: string[], filePath: string): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    const slice = commands.slice(-HISTORY_MAX)
    writeFileSync(filePath, JSON.stringify(slice, null, 2), 'utf8')
  } catch {
    log.warn(`saveHistory: falha ao escrever ${filePath}`)
  }
}

/** Carrega histórico de comandos do disco. Retorna [] se não existir ou for inválido. */
export function loadHistory(filePath: string): string[] {
  try {
    if (!existsSync(filePath)) return []
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e): e is string => typeof e === 'string')
  } catch {
    return []
  }
}
