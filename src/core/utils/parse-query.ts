/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Safe query-param parsing utilities.
 *
 * Prevents NaN injection when `parseInt` / `Number` is called on untrusted
 * query-string values that may be undefined or non-numeric.
 */

export interface ParseIntResult {
  value: number
  error?: string
}

/**
 * Safely parse an integer from an Express query parameter.
 *
 * @param raw    - The raw query param (may be string | undefined).
 * @param opts   - min/max bounds and the default value when raw is absent.
 * @returns      Parsed value, or an error string if invalid.
 */
export function safeParseInt(
  raw: string | undefined,
  opts: { min?: number; max?: number; defaultValue: number },
): ParseIntResult {
  if (raw === undefined || raw === '') {
    return { value: opts.defaultValue }
  }

  const nVar = parseInt(raw, 10)

  if (isNaN(nVar)) {
    return { value: opts.defaultValue, error: `Expected integer, got: "${raw}"` }
  }
  if (opts.min !== undefined && nVar < opts.min) {
    return { value: opts.defaultValue, error: `Value ${nVar} is below minimum ${opts.min}` }
  }
  if (opts.max !== undefined && nVar > opts.max) {
    return { value: opts.defaultValue, error: `Value ${nVar} exceeds maximum ${opts.max}` }
  }

  return { value: nVar }
}
