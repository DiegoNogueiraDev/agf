/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_3f9de549e761 — formatElapsed: duração legível e compacta para a status
 * line da TUI. `"5s"`, `"1m 23s"`, `"1h 02m"`. Pura. Inspirado no indicador de
 * status do Codex CLI.
 */
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/elapsed.ts' })

/** Formats a millisecond duration as a compact human-readable string: "5s", "1m 23s", "1h 02m". */
export function formatElapsed(ms: number): string {
  log.debug(`formatElapsed: ${ms}ms`)
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}
