/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Text normalization utilities for store boundary processing.
 */

/**
 * Normalize escaped newlines (literal \\n → actual \n) at store boundary.
 * MCP clients often pass literal \\n in text which should be real newlines.
 */
export function normalizeNewlines(text: string | undefined): string | undefined {
  if (!text) return text
  return text.replace(/\\n/g, '\n')
}
