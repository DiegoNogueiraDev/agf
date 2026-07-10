/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 *
 * E3a — failure-focus filter: collapses PASS lines in test output,
 * keeping only failures and summary. Inspired by "Failure Focus" compression
 * strategy. Target: 94-99% reduction in pass-heavy suites.
 */

import type { FilterFn } from '../registry.js'

// Detect vitest/jest PASS/FAIL lines
const VITEST_PASS = /^\s*[✓✔]\s/
const VITEST_FAIL = /^\s*[✗✕❌×]\s/
const TEST_FILE_HEADER = /^\s*(?:PASS|FAIL)\s+\S/
const SUMMARY_START = /^\s*Test (?:Files|Suites|Tests)\s+\d/
const SUMMARY_END = /^\s*(?:Tests|Test Suites):\s+\d/
const PYTEST_PASS = /^\S+\.py\s+[.]+$/ // pytest pass dots
const PYTEST_FAIL = /^(FAILED|ERROR|_+\s.*\s_+)/

export const failureFocus: FilterFn = (text: string): string => {
  const lines = text.split('\n')
  const out: string[] = []
  let passCount = 0
  let failCount = 0
  let inFailBlock = false
  let inSummary = false

  for (const line of lines) {
    // Detect summary section start — always preserve from here
    if (SUMMARY_START.test(line) || SUMMARY_END.test(line)) {
      inSummary = true
      out.push(line)
      continue
    }

    // Already in summary — preserve all lines
    if (inSummary) {
      out.push(line)
      continue
    }

    // Vitest/Jest PASS → increment count, skip
    if (VITEST_PASS.test(line.trim())) {
      passCount++
      continue
    }

    // Vitest/Jest FAIL → keep and enter fail block
    if (VITEST_FAIL.test(line.trim())) {
      failCount++
      out.push(line)
      inFailBlock = true
      continue
    }

    // Test file header (PASS/FAIL prefix) → skip pass, keep fail
    if (TEST_FILE_HEADER.test(line.trim())) {
      if (line.includes('PASS')) {
        passCount++
        continue
      } else if (line.includes('FAIL')) {
        failCount++
        out.push(line)
        inFailBlock = true
        continue
      }
    }

    // Pytest pass dots → skip
    if (PYTEST_PASS.test(line.trim())) {
      passCount += line.replace(/\s/g, '').length
      continue
    }

    // Pytest fail marker → keep
    if (PYTEST_FAIL.test(line.trim())) {
      out.push(line)
      inFailBlock = true
      continue
    }

    // During fail block — preserve error details, stack traces, diff output
    if (inFailBlock) {
      // Empty line ends fail block (next line is either new test or summary)
      if (line.trim() === '') {
        inFailBlock = false
      }
      out.push(line)
      continue
    }

    // Lines that are clearly not test results (build output, warnings, etc.)
    // Keep them but only if they look important
    const trimmed = line.trim()
    if (!trimmed) {
      // Collapse multiple blank lines
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('')
      }
      continue
    }

    // Default: keep the line (might be a test name or other important info)
    out.push(line)
  }

  // Prepend collapsed stats at the top
  const stats: string[] = []
  if (passCount > 0) {
    stats.push(`${passCount} tests passed (collapsed)`)
  }
  if (failCount > 0) {
    stats.push(`${failCount} tests failed`)
  }

  if (stats.length > 0) {
    out.unshift(...stats, '')
  }

  const result = out.join('\n')
  return result.length > 0 && result.length < text.length ? result : text
}
;(failureFocus as unknown as { filterName: string }).filterName = 'failure-focus'
