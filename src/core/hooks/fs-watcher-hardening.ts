/*!
 * fs-watcher-hardening — debounce coalescing, ignore filtering, and dual-channel helpers.
 *
 * WHY: node:fs.watch can drop events under burst writes and doesn't coalesce.
 * This module adds pure utility functions that harden the existing installFsWatcher
 * (fs-watcher.ts) without re-implementing the watcher:
 *
 *   1. coalesceEvents(): merges rapid same-path events → single latest event.
 *   2. shouldIgnorePath(): fast regex check against ignore patterns.
 *   3. DEFAULT_IGNORE_PATTERNS: canonical ignore list shared with fs-watcher.ts.
 *
 * The "dual-channel" design pairs native fs.watch (fast) with a periodic
 * reconciliation poll (reliable) — callers schedule reconciliation via setInterval
 * and feed the diff into the same coalesceEvents + shouldIgnorePath pipeline.
 *
 * Pure functions — no I/O.
 */

export interface FileEvent {
  /** Relative or absolute path of the changed file. */
  path: string
  type: 'change' | 'rename' | 'delete'
  /** Timestamp in ms of when the event was observed. */
  ts: number
}

/** Canonical ignore patterns shared with installFsWatcher (fs-watcher.ts). */
export const DEFAULT_IGNORE_PATTERNS: RegExp[] = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)\.cache(\/|$)/,
  /(^|\/)coverage(\/|$)/,
  /\.tsbuildinfo$/,
  /\.log$/,
]

/**
 * Coalesce a burst of file events for the same path into a single event.
 * For each unique path, keeps the event with the highest ts (latest write wins).
 * Order of output is insertion-order of first occurrence per path.
 */
export function coalesceEvents(events: FileEvent[]): FileEvent[] {
  const latest = new Map<string, FileEvent>()
  for (const ev of events) {
    const existing = latest.get(ev.path)
    if (!existing || ev.ts > existing.ts) {
      latest.set(ev.path, ev)
    }
  }
  return [...latest.values()]
}

/**
 * Return true when the path matches any ignore pattern — event should be suppressed.
 *
 * @param path     - Relative or absolute file path to test.
 * @param patterns - Regex list to test against (use DEFAULT_IGNORE_PATTERNS as default).
 */
export function shouldIgnorePath(path: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(path))
}
