/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * B4 — Interval-loop core: re-run injected work on a clock, bounded by a run
 * count and/or a wall-clock budget.
 *
 * Complements {@link runGoalLoop} (dynamic, rubric-driven) with a simple
 * "every N → do work" cadence. All side effects are INJECTED (`runOnce`,
 * `sleep`, `now`) so the loop is unit-testable with zero real waiting and a
 * deterministic clock — no live LLM, no real timers in tests.
 *
 * Guardrails:
 * - At least one bound (`maxRuns` or `maxTotalMs`) is enforced; if neither is
 *   provided it defaults to `maxRuns = 1` so the loop never runs forever.
 * - Cooperative abort via an injected `{ aborted: boolean }` signal, checked
 *   between runs (never interrupts an in-flight `runOnce`).
 */

import { InvalidArgumentError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

/** Why the interval loop stopped. */
export type IntervalStopReason = 'max_runs' | 'timeout' | 'aborted'

export interface IntervalLoopResult {
  runs: number
  stopped: IntervalStopReason
}

export interface IntervalLoopOptions {
  /** Delay between runs, in milliseconds. */
  everyMs: number
  /** Bound by number of runs. */
  maxRuns?: number
  /** Bound by total wall-clock budget, in milliseconds. */
  maxTotalMs?: number
  /** Cooperative cancellation signal, checked between runs. */
  signal?: { aborted: boolean }
  /** Injected work for each run; `run` is the 1-based run index. */
  runOnce: (run: number) => Promise<void> | void
  /** Injected sleep (default: real setTimeout) — tests pass an instant stub. */
  sleep?: (ms: number) => Promise<void>
  /** Injected clock (default: Date.now) — tests pass a deterministic stub. */
  now?: () => number
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Run `runOnce` immediately (run 1), then sleep `everyMs` and repeat until a
 * bound is hit or the signal aborts. Deterministic given injected `sleep`/`now`.
 */
export async function runIntervalLoop(opts: IntervalLoopOptions): Promise<IntervalLoopResult> {
  const sleep = opts.sleep ?? realSleep
  const now = opts.now ?? Date.now
  // Enforce at least one bound; default to a single run (never loop forever).
  const maxRuns = opts.maxRuns ?? (opts.maxTotalMs === undefined ? 1 : Number.POSITIVE_INFINITY)
  const maxTotalMs = opts.maxTotalMs ?? Number.POSITIVE_INFINITY

  const start = now()
  let runs = 0
  const isAborted = (): boolean => opts.signal?.aborted === true

  for (;;) {
    if (isAborted()) {
      logger.debug('interval-loop: aborted', { runs })
      return { runs, stopped: 'aborted' }
    }

    runs += 1
    await opts.runOnce(runs)

    if (isAborted()) {
      logger.debug('interval-loop: aborted', { runs })
      return { runs, stopped: 'aborted' }
    }

    if (runs >= maxRuns) {
      logger.debug('interval-loop: max runs', { runs })
      return { runs, stopped: 'max_runs' }
    }

    if (now() - start >= maxTotalMs) {
      logger.debug('interval-loop: timeout', { runs })
      return { runs, stopped: 'timeout' }
    }

    await sleep(opts.everyMs)
  }
}

/** Suffixes understood by {@link parseDuration}, in milliseconds. */
const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
}

/**
 * Parse a human duration (`500ms`, `30s`, `5m`, `2h`) to milliseconds. A bare
 * number is treated as milliseconds. Throws on unparseable / negative input.
 */
export function parseDuration(input: string): number {
  const text = input.trim()
  // Split a trailing unit suffix (ms/s/m/h) from the numeric head, then validate
  // each part separately — avoids a single nested-quantifier regex.
  const unitMatch = /(ms|s|m|h)$/.exec(text)
  const unit = unitMatch ? unitMatch[1] : 'ms'
  const numericPart = unitMatch ? text.slice(0, text.length - unitMatch[1].length) : text
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored integer/decimal with a single optional group; linear, no catastrophic backtracking
  if (!/^\d+(\.\d+)?$/.test(numericPart)) {
    throw new InvalidArgumentError(`Invalid duration: "${input}". Use forms like 500ms, 30s, 5m, 2h.`)
  }
  const value = Number.parseFloat(numericPart)
  return Math.round(value * DURATION_UNITS[unit])
}
