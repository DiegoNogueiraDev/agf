/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Test Runner — Vitest JSON Reporter Integration
 *
 * Executes Vitest test files as child_process and parses JSON output.
 * Provides closed-loop feedback for the agent TDD cycle.
 *
 * Based on: Cybernetics (Wiener, 1948) — Closed-Loop Feedback
 * and DORA Metrics (Accelerate, 2018) — Shift-Left testing.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'test-runner.ts' })

// ── Types ───────────────────────────────────────────────

export interface TestRunOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number
  /** Working directory (default: process.cwd()) */
  cwd?: string
}

export interface TestError {
  testName: string
  message: string
  stack?: string
}

export interface TestRunResult {
  success: boolean
  passed: number
  failed: number
  errors: TestError[]
  durationMs: number
  timedOut: boolean
  rawOutput?: string
}

// ── Vitest JSON output types (subset) ───────────────────

interface VitestJsonResult {
  numPassedTests?: number
  numFailedTests?: number
  success?: boolean
  testResults?: Array<{
    assertionResults?: Array<{
      fullName?: string
      status?: string
      failureMessages?: string[]
    }>
  }>
}

// ── Runner ──────────────────────────────────────────────

/**
 * Run Vitest on specific test files and return structured results.
 * Uses `--reporter=json` for machine-parseable output.
 * Delegates to dual runner for framework auto-detection.
 */
export async function runTests(testFiles: string[], options?: TestRunOptions): Promise<TestRunResult> {
  const { runDualTests } = await import('./dual-runner.js')
  return runDualTests(testFiles, options)
}

/**
 * Parse Vitest JSON output from stdout.
 * The JSON may be mixed with other output — find the JSON object.
 */
function _parseVitestJson(stdout: string): VitestJsonResult | null {
  if (!stdout) return null

  // Try direct parse first
  try {
    return JSON.parse(stdout) as VitestJsonResult
  } catch (err) {
    log.debug('intentional-swallow', {
      error: String(err),
      reason: 'JSON might be mixed with other output — find the last { ... } block',
    })
  }

  // Find the last JSON object in the output
  const lastBrace = stdout.lastIndexOf('}')
  if (lastBrace === -1) return null

  // Walk backwards to find matching opening brace
  let depth = 0
  let start = -1
  for (let i = lastBrace; i >= 0; i--) {
    if (stdout[i] === '}') depth++
    if (stdout[i] === '{') depth--
    if (depth === 0) {
      start = i
      break
    }
  }

  if (start === -1) return null

  try {
    return JSON.parse(stdout.slice(start, lastBrace + 1)) as VitestJsonResult
  } catch {
    return null
  }
}

/**
 * Extract structured errors from Vitest JSON result.
 */
function _extractErrors(result: VitestJsonResult): TestError[] {
  const errors: TestError[] = []

  for (const suite of result.testResults ?? []) {
    for (const test of suite.assertionResults ?? []) {
      if (test.status === 'failed' && test.failureMessages) {
        errors.push({
          testName: test.fullName ?? 'unknown',
          message: test.failureMessages[0]?.slice(0, 500) ?? 'Test failed',
          stack: test.failureMessages[0]?.slice(0, 1000),
        })
      }
    }
  }

  return errors
}
