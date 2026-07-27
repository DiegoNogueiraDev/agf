/*!
 * WHY: Emit only the changed region of a file (search/replace) instead of
 * rewriting the whole file. Output is proportional to the change size, not the
 * file size — the primary economy lever for large-file edits.
 *
 * LIMITS: search is literal string matching (no fuzzy/regex). Multi-occurrence
 * search strings are only applied to the first match. Cross-hunk edits (multiple
 * disjoint regions) require multiple SearchReplaceEdit calls. For diffs that
 * don't match, fallback to full-file rewrite (caller responsibility).
 *
 * Composes with: implement-attempt.ts (build path), economy-lever-ledger.ts.
 * Contract: pure, no I/O.
 */

export interface SearchReplaceEdit {
  /** Exact text to find in the original file. */
  search: string
  /** Text to substitute in place of `search`. */
  replace: string
}

export interface ApplyResult {
  /** True when the search string was found and replaced. */
  applied: boolean
  /** Resulting file content. Equals original when applied=false. */
  content: string
}

/**
 * Build a minimal SearchReplaceEdit from two versions of a code region.
 * Returns null when old and new are identical (no edit needed).
 */
export function buildSearchReplace(oldRegion: string, newRegion: string): SearchReplaceEdit | null {
  if (oldRegion === newRegion) return null
  return { search: oldRegion, replace: newRegion }
}

/**
 * Apply a SearchReplaceEdit to file content.
 * Returns applied=false and the original content unchanged when the search
 * string is not found (AC3 fallback signal — caller must rewrite the full file).
 */
export function applySearchReplace(original: string, edit: SearchReplaceEdit): ApplyResult {
  const idx = original.indexOf(edit.search)
  if (idx === -1) return { applied: false, content: original }
  const content = original.slice(0, idx) + edit.replace + original.slice(idx + edit.search.length)
  return { applied: true, content }
}
