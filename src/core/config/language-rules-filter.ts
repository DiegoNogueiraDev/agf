/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * language-rules-filter — selects only rule packs applicable to the
 * active project stack, preventing TS rules from polluting a Go project, etc.
 *
 * WHY: injecting all language rule packs into every project wastes tokens
 * and confuses agents with irrelevant guidance. Filtering by detected
 * runtime ensures only relevant rules are included.
 *
 * Pure function — no I/O. Callers use detectStack() to determine the
 * active languages and pass the full rule pack catalogue here.
 */

export interface RulePack {
  /** Unique rule-pack identifier (e.g. 'typescript', 'golang'). */
  id: string
  /**
   * Languages this pack applies to. An empty array means the pack is
   * language-agnostic and always included (e.g. 'common').
   */
  languages: string[]
  /** Rule content to inject into context. */
  content: string
}

/**
 * Filter rule packs to those applicable to the active language stack.
 * - Packs with empty `languages` are always included (common rules).
 * - Packs with non-empty `languages` are included only when their language
 *   list intersects with `activeLanguages` (case-insensitive).
 *
 * @param activeLanguages - Detected runtime/language identifiers for the project.
 * @param packs - Full catalogue of available rule packs.
 */
export function filterRulesByStack(activeLanguages: string[], packs: RulePack[]): RulePack[] {
  const active = new Set(activeLanguages.map((l) => l.toLowerCase()))
  return packs.filter((pack) => {
    if (pack.languages.length === 0) return true
    return pack.languages.some((lang) => active.has(lang.toLowerCase()))
  })
}
