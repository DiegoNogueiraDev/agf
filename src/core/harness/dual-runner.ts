/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Dual Test Runner — auto-detects vitest vs node:test per file.
 * Files with `import ... from 'vitest'` run via vitest; all others via `node --test`.
 */

import { execFile } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { createLogger } from '../utils/logger.js'
import type { TestRunOptions, TestRunResult, TestError } from './test-runner.js'

const log = createLogger({ layer: 'core', source: 'dual-runner.ts' })

export const VITEST_PATTERN =
  /(?:import|require)\s*(?:\{[^}]*\}\s+from\s+|\w+\s+from\s+|\*\s+as\s+\w+\s+from\s+|\()?\s*['"]vitest['"]/

/**
 * Detect whether a test file uses vitest or node:test.
 * Reads the first 100 lines and checks for vitest import/require.
 */
export function detectTestFramework(filePath: string): 'vitest' | 'node-test' {
  if (!existsSync(filePath)) return 'node-test'
  try {
    const content = readFileSync(filePath, 'utf-8')
    const firstLines = content.split('\n').slice(0, 100).join('\n')
    return VITEST_PATTERN.test(firstLines) ? 'vitest' : 'node-test'
  } catch {
    return 'node-test'
  }
}

export interface DualTestRunOptions extends TestRunOptions {
  /** Override framework detection for all files */
  force?: 'vitest' | 'node-test'
}

/**
 * Run tests with auto-detection of the test framework.
 * Groups files by framework and runs each group with the appropriate runner.
 */
export async function runDualTests(testFiles: string[], options?: DualTestRunOptions): Promise<TestRunResult> {
  const timeoutMs = options?.timeoutMs ?? 30000
  const cwd = options?.cwd ?? process.cwd()
  const startTime = Date.now()

  if (testFiles.length === 0) {
    return { success: true, passed: 0, failed: 0, errors: [], durationMs: 0, timedOut: false }
  }

  // Group files by framework
  const vitestFiles: string[] = []
  const nodeTestFiles: string[] = []

  for (const file of testFiles) {
    if (options?.force === 'vitest') {
      vitestFiles.push(file)
    } else if (options?.force === 'node-test') {
      nodeTestFiles.push(file)
    } else {
      const framework = detectTestFramework(file)
      if (framework === 'vitest') vitestFiles.push(file)
      else nodeTestFiles.push(file)
    }
  }

  // Run each group and merge results
  const results: TestRunResult[] = []

  if (vitestFiles.length > 0) {
    log.debug('dual-runner:vitest', { count: vitestFiles.length })
    const r = await runVitest(vitestFiles, { timeoutMs, cwd })
    results.push(r)
  }

  if (nodeTestFiles.length > 0) {
    log.debug('dual-runner:node-test', { count: nodeTestFiles.length })
    const r = await runNodeTest(nodeTestFiles, { timeoutMs, cwd })
    results.push(r)
  }

  return mergeResults(results, Date.now() - startTime)
}

/**
 * Run vitest on specific test files.
 */
async function runVitest(testFiles: string[], options: TestRunOptions): Promise<TestRunResult> {
  const timeoutMs = options.timeoutMs ?? 30000
  const cwd = options.cwd ?? process.cwd()
  const startTime = Date.now()

  return new Promise<TestRunResult>((resolve) => {
    const args = ['vitest', 'run', '--reporter=json', ...testFiles]

    const child = execFile(
      'npx',
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0' },
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime

        if (error && 'killed' in error && error.killed) {
          resolve({
            success: false,
            passed: 0,
            failed: 0,
            errors: [{ testName: 'timeout', message: `Vitest timed out after ${timeoutMs}ms` }],
            durationMs,
            timedOut: true,
          })
          return
        }

        const jsonResult = parseVitestJson(stdout)
        if (jsonResult) {
          const errors = extractVitestErrors(jsonResult)
          const passed = jsonResult.numPassedTests ?? 0
          const failed = jsonResult.numFailedTests ?? 0
          resolve({
            success: failed === 0 && (jsonResult.success ?? true),
            passed,
            failed,
            errors,
            durationMs,
            timedOut: false,
          })
        } else {
          const errMsg = stderr?.trim() || error?.message || 'Unknown vitest error'
          resolve({
            success: false,
            passed: 0,
            failed: 1,
            errors: [{ testName: 'vitest', message: errMsg.slice(0, 500) }],
            durationMs,
            timedOut: false,
            rawOutput: stdout?.slice(0, 1000),
          })
        }
      },
    )

    child.on('error', (err) => {
      resolve({
        success: false,
        passed: 0,
        failed: 0,
        errors: [{ testName: 'spawn', message: err.message }],
        durationMs: Date.now() - startTime,
        timedOut: false,
      })
    })
  })
}

/**
 * Run node:test on specific test files.
 */
async function runNodeTest(testFiles: string[], options: TestRunOptions): Promise<TestRunResult> {
  const timeoutMs = options.timeoutMs ?? 30000
  const cwd = options.cwd ?? process.cwd()
  const startTime = Date.now()

  return new Promise<TestRunResult>((resolve) => {
    const args = ['--test', ...testFiles]

    const child = execFile(
      'node',
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0', NODE_OPTIONS: '--no-warnings' },
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime

        if (error && 'killed' in error && error.killed) {
          resolve({
            success: false,
            passed: 0,
            failed: 0,
            errors: [{ testName: 'timeout', message: `node --test timed out after ${timeoutMs}ms` }],
            durationMs,
            timedOut: true,
          })
          return
        }

        // node:test exits with code 1 on failure
        const failed = error && typeof error.code === 'number' && error.code !== 0 ? 1 : 0
        const passed = failed === 0 ? testFiles.length : testFiles.length - 1
        const errMsg = stderr?.trim()

        resolve({
          success: failed === 0,
          passed,
          failed,
          errors: failed > 0 && errMsg ? [{ testName: 'node-test', message: errMsg.slice(0, 500) }] : [],
          durationMs,
          timedOut: false,
          rawOutput: stdout?.slice(0, 1000),
        })
      },
    )

    child.on('error', (err) => {
      resolve({
        success: false,
        passed: 0,
        failed: 0,
        errors: [{ testName: 'spawn', message: err.message }],
        durationMs: Date.now() - startTime,
        timedOut: false,
      })
    })
  })
}

function mergeResults(results: TestRunResult[], totalDurationMs: number): TestRunResult {
  let passed = 0
  let failed = 0
  const errors: TestError[] = []
  let anyTimedOut = false

  for (const r of results) {
    passed += r.passed
    failed += r.failed
    errors.push(...r.errors)
    if (r.timedOut) anyTimedOut = true
  }

  return {
    success: failed === 0 && !anyTimedOut,
    passed,
    failed,
    errors,
    durationMs: totalDurationMs,
    timedOut: anyTimedOut,
  }
}

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

function parseVitestJson(stdout: string): VitestJsonResult | null {
  if (!stdout) return null
  try {
    return JSON.parse(stdout) as VitestJsonResult
  } catch {
    // fallback: find last JSON object
  }
  const lastBrace = stdout.lastIndexOf('}')
  if (lastBrace === -1) return null
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

function extractVitestErrors(result: VitestJsonResult): TestError[] {
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
