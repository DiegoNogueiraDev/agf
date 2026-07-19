/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * String similarity utilities — tokenization and Jaccard similarity.
 * Extracted from siebel/wsdl-correlation.ts for reuse across modules.
 */

/** Tokenize a name by splitting camelCase, PascalCase, snake_case, kebab-case. Filters single-char tokens. */
export function tokenize(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

/** Jaccard similarity between two sets: |intersection| / |union|. Returns 0 for empty sets. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)))
  const union = new Set([...a, ...b])
  return union.size > 0 ? intersection.size / union.size : 0
}
