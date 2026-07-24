/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_56dd43cda396 — Terminal size utilities for TUI resize handling.
 */

export interface TerminalSize {
  rows: number
  columns: number
}

const FALLBACK: TerminalSize = { rows: 24, columns: 80 }

/** Parses terminal dimensions from stdout, falling back to 24×80 if unavailable. */
export function parseTerminalSize(stdout: { rows?: number; columns?: number }): TerminalSize {
  const rows = stdout.rows ?? 0
  const columns = stdout.columns ?? 0
  if (rows > 0 && columns > 0) return { rows, columns }
  return FALLBACK
}
