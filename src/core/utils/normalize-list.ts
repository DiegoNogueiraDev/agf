/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * normalize-list — accepts variadic CLI values and/or comma-separated
 * values, returns clean, trimmed, de-duplicated entries in first-seen order.
 *
 * WHY shared here: graph/normalize-tags.ts owned this exact split+trim+dedup
 * logic for tags, but node-cmd.ts's --test-files/--implementation-files
 * options passed their raw arrays through untouched — `--test-files 'a,b'`
 * was silently stored as ONE file literally named "a,b", producing a false
 * PHANTOM_TESTFILE gap. Extracted here so both domains (tags, file lists)
 * share one implementation instead of two parallel copies (DRY).
 *
 * Pure function — no I/O.
 */
export function normalizeList(raw: readonly string[] | undefined): string[] {
  if (!raw || raw.length === 0) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of raw) {
    for (const piece of entry.split(',')) {
      const value = piece.trim()
      if (value.length === 0 || seen.has(value)) continue
      seen.add(value)
      out.push(value)
    }
  }
  return out
}
