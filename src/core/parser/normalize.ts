/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Stage 1: Text normalization.
 * - Standardize line endings
 * - Remove duplicate blank lines
 * - Trim whitespace
 * - Standardize bullet markers to "-"
 */
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'parser/normalize.ts' })

export function normalize(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Collapse 3+ consecutive blank lines into 2
  text = text.replace(/\n{3,}/g, '\n\n')

  // Standardize bullet markers: *, •, ●, + → -
  // AUDIT-007: `+` is a valid Markdown list marker but was previously left
  // untouched, so `+ item` bullets were dropped by the `-`-only item parser.
  text = text.replace(/^(\s*)[*•●+]\s/gm, '$1- ')

  // Trim trailing whitespace per line
  text = text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()

  return text
}
