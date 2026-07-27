/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Detects tasks whose external runtime / corpus dependency is absent.
 * Returns the subset of tasks that should be marked `blocked`.
 *
 * Pure function — no I/O, no graph mutation.
 * Caller is responsible for writing `blocked` status to the graph.
 */

export interface HardBlockRule {
  /** The runtime key callers supply in `availableRuntimes`. */
  requiredRuntime: string
  /** Pattern matched against task title + tags + description. */
  matchPatterns: RegExp[]
}

export interface TaskLike {
  id: string
  title: string
  tags?: string[]
  description?: string
}

export interface HardBlockResult {
  nodeId: string
  requiredRuntime: string
  reason: string
}

/** Built-in rules for the most common hard-block patterns in this codebase. */
export const HARD_BLOCK_RULES: HardBlockRule[] = [
  {
    requiredRuntime: 'java',
    matchPatterns: [/\bjava\b/i, /\bjvm\b/i, /\bcobol\b.*\bjava\b/i, /\bjava\b.*\bcobol\b/i],
  },
  {
    requiredRuntime: 'go',
    matchPatterns: [/\bgo\b.*\bbuildi?n?g?\b/i, /\bgo\b.*\bharness\b/i, /\btag[s]?:.*\bgo\b/i, /^go\b/i],
  },
  {
    requiredRuntime: 'corpus',
    matchPatterns: [/\bcorpus\b/i],
  },
]

function taskText(task: TaskLike): string {
  return [task.title, (task.tags ?? []).join(' '), task.description ?? ''].join(' ')
}

function matchesRule(task: TaskLike, rule: HardBlockRule): boolean {
  const text = taskText(task)
  return rule.matchPatterns.some((p) => p.test(text))
}

/**
 * Returns the tasks that should be hard-blocked due to absent runtimes.
 *
 * @param tasks - Tasks in `backlog` or `ready` status to evaluate.
 * @param availableRuntimes - Runtimes confirmed present in the environment
 *   (e.g. `['node', 'java']`). Keys must match `HardBlockRule.requiredRuntime`.
 * @param rules - Override built-in rules (useful for testing custom patterns).
 */
export function detectHardBlocks(
  tasks: readonly TaskLike[],
  availableRuntimes: readonly string[],
  rules: readonly HardBlockRule[] = HARD_BLOCK_RULES,
): HardBlockResult[] {
  const available = new Set(availableRuntimes.map((r) => r.toLowerCase()))
  const results: HardBlockResult[] = []

  for (const task of tasks) {
    for (const rule of rules) {
      if (available.has(rule.requiredRuntime)) continue // runtime present — skip
      if (!matchesRule(task, rule)) continue
      results.push({
        nodeId: task.id,
        requiredRuntime: rule.requiredRuntime,
        reason: `Requires runtime/corpus "${rule.requiredRuntime}" which is not available in this environment`,
      })
      break // one block reason per task is enough
    }
  }

  return results
}
