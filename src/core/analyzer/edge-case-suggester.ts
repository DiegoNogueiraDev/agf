/*!
 * Deterministic edge-case AC suggester — zero LLM tokens.
 * Task node_9e4d4f334592.
 *
 * WHY: Missing edge-case ACs are a top source of production bugs. This module
 * maps task title/description keywords to standard edge-case stubs
 * (empty_input, error_path, boundary, concurrency) without any LLM call —
 * deterministic, fast, composable with gaps detection.
 *
 * Composes with: gaps/detect-weak-ac.ts (caller), ac-cmd.ts (CLI wire).
 */

export type EdgeCaseCategory = 'empty_input' | 'error_path' | 'boundary' | 'concurrency'

export interface EdgeCaseSuggestion {
  category: EdgeCaseCategory
  acText: string
  rationale: string
}

export interface EdgeCaseInput {
  title: string
  description?: string
  /** Node type — only 'task' nodes get suggestions; containers return []. */
  type: string
}

/** Keywords that signal I/O file operations. */
const IO_KEYWORDS = /\b(file|read|write|load|save|parse|import|export|disk|path|stream|csv|json|yaml|yml|config)\b/i

/** Keywords that signal a computation / pure function. */
const CALC_KEYWORDS =
  /\b(calculat|comput|score|sum|count|average|total|budget|ratio|percent|sort|filter|rank|max|min)\b/i

/** Keywords that signal concurrency / shared state. */
const CONCURRENCY_KEYWORDS = /\b(concurrent|parallel|async|thread|race|mutex|lock|queue|batch|worker|process)\b/i

export function suggestEdgeCaseAcs(input: EdgeCaseInput): EdgeCaseSuggestion[] {
  // Containers (epics, requirements) do not have concrete edge-cases to suggest
  if (input.type !== 'task') return []

  const text = `${input.title} ${input.description ?? ''}`
  const suggestions: EdgeCaseSuggestion[] = []

  if (IO_KEYWORDS.test(text)) {
    suggestions.push({
      category: 'empty_input',
      acText: 'Given an empty or missing input, When processed, Then a typed error is raised (no silent failure)',
      rationale: 'I/O operations must handle absent/empty input explicitly',
    })
    suggestions.push({
      category: 'error_path',
      acText:
        'Given the I/O operation fails (e.g. file not found, permission denied), When handled, Then the error is propagated with context (file path, reason)',
      rationale: 'I/O failure is the most common edge-case to miss in tests',
    })
  }

  if (CALC_KEYWORDS.test(text)) {
    suggestions.push({
      category: 'boundary',
      acText:
        'Given inputs at the boundary (0, negative, max value), When computed, Then the result is well-defined (no overflow, no NaN)',
      rationale: 'Computation tasks must specify behavior at numeric extremes',
    })
  }

  if (CONCURRENCY_KEYWORDS.test(text)) {
    suggestions.push({
      category: 'concurrency',
      acText:
        'Given multiple concurrent callers, When all execute simultaneously, Then the result is consistent (no race condition)',
      rationale: 'Concurrent paths require explicit ordering/locking guarantees',
    })
  }

  // Always add boundary for any task that doesn't already have it
  if (!suggestions.some((s) => s.category === 'boundary')) {
    suggestions.push({
      category: 'boundary',
      acText: 'Given an empty list or zero-item input, When processed, Then the result is an empty list (no crash)',
      rationale: 'Empty-collection boundary is the most commonly missed edge-case',
    })
  }

  return suggestions
}
