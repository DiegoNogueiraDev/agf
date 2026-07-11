/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_dbc4b33ff480 — Render de diff +/- por edição, para a TUI mostrar o que
 * o agente mudou. Puro: produz linhas com prefixo `── path ──`, `-` (removido)
 * e `+` (adicionado). Inspirado no `diff_render` do Codex CLI.
 */
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/diff-render.ts' })

export interface EditLike {
  path: string
  oldString: string
  newString: string
}

/** Linhas de diff para um único edit (header + `-` antigas + `+` novas). */
export function renderEditDiff(edit: EditLike): string[] {
  log.debug(`renderEditDiff: ${edit.path}`)
  const lines: string[] = [`── ${edit.path} ──`]
  if (edit.oldString.length > 0) {
    for (const l of edit.oldString.split('\n')) lines.push(`- ${l}`)
  }
  if (edit.newString.length > 0) {
    for (const l of edit.newString.split('\n')) lines.push(`+ ${l}`)
  }
  return lines
}

/** Concatena o diff de vários edits (na ordem do plano). */
export function renderPlanDiff(edits: EditLike[]): string[] {
  return edits.flatMap(renderEditDiff)
}
