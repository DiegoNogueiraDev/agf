/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

/**
 * Structured failure extraction (L2) — instead of just stripping passing tests,
 * parse the test output into structured assertion summaries. The LLM receives
 * precise expected-vs-actual instead of raw output.
 *
 * Lossless by design: if parsing fails, returns the input unchanged.
 */

// ── Vitest / Jest patterns ──────────────────────────────
const RE_FAIL_HEADER = /^\s*[×✗❯]\s.*(FAIL|fail|F)/
const RE_ASSERT = /(?:\bexpected\b|\breceived\b|\bto(?:Be|Equal|Match|Have|Contain|Throw)\b|→)/
const RE_EXPECTED = /(?:\bexpected\b|-\s+Expected|expected=|Expected:)/i
const RE_RECEIVED = /(?:\breceived\b|\+\s+Received|received=|Received:)/i
const RE_FILE_LINE = /^\s+at\s+(\S+)\.(test|spec)\.\w+:(\d+):(\d+)/

// ── Pytest patterns ─────────────────────────────────────
const RE_PYTEST_LOCATION = /^(\S+?\.py):(\d+):?\s*(AssertionError|Failed)/

// ── Go test patterns ────────────────────────────────────
const RE_GO_FAIL_LINE = /^\s*(--- FAIL:)/
const RE_GO_LOCATION = /^\s*(\S+?\.go):(\d+)/

// ── Cargo test (Rust) patterns ───────────────────────────
const RE_CARGO_FAIL_LINE = /^test \S.* \.\.\. FAILED$/
const RE_CARGO_PANIC = /panicked at '([^']+)'/
const RE_CARGO_LOCATION = /panicked at .*, (\S+?\.rs):(\d+)/

interface ExtractedFailure {
  file: string
  line: number
  testName?: string
  expected?: string
  received?: string
  message?: string
}

function extractPytestAssertion(text: string): ExtractedFailure[] {
  const failures: ExtractedFailure[] = []
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const loc = lines[i].match(RE_PYTEST_LOCATION)
    if (!loc) continue

    let expected = ''
    let received = ''
    const msgParts: string[] = [lines[i].trim()]

    for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
      const l = lines[j].trim()
      if (!l) break
      if (RE_EXPECTED.test(l)) expected = l
      if (RE_RECEIVED.test(l)) received = l
      msgParts.push(l)
    }

    failures.push({
      file: loc[1],
      line: parseInt(loc[2], 10),
      message: msgParts.join('\n'),
      expected: expected || undefined,
      received: received || undefined,
    })
  }
  return failures
}

function extractJsAssertion(text: string): ExtractedFailure[] {
  const failures: ExtractedFailure[] = []
  const lines = text.split('\n')
  let current: ExtractedFailure | null = null
  let inDetails = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Locate the failing test header
    if (RE_FAIL_HEADER.test(line)) {
      if (current) failures.push(current)
      const match = line.match(/^\s*[×✗❯]\s+(.+)/)
      current = {
        file: '',
        line: 0,
        testName: match ? match[1].trim() : line.trim(),
      }
      inDetails = false
      continue
    }

    const fileLineMatch = line.match(RE_FILE_LINE)
    if (fileLineMatch && current) {
      current.file = fileLineMatch[1]
      current.line = parseInt(fileLineMatch[2], 10)
      inDetails = true
      continue
    }

    if (current && inDetails) {
      if (RE_EXPECTED.test(line)) {
        current.expected = line.trim()
      } else if (RE_RECEIVED.test(line)) {
        current.received = line.trim()
      } else if (RE_ASSERT.test(line)) {
        current.message = current.message ? `${current.message}\n${line.trim()}` : line.trim()
      }
    }
  }

  if (current) failures.push(current)
  return failures
}

function extractGoAssertion(text: string): ExtractedFailure[] {
  const failures: ExtractedFailure[] = []
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    if (!RE_GO_FAIL_LINE.test(lines[i])) continue
    const loc = lines[i].match(RE_GO_LOCATION)
    const msgParts: string[] = [lines[i].trim()]
    for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
      const l = lines[j].trim()
      if (!l || RE_GO_FAIL_LINE.test(l)) break
      msgParts.push(l)
    }
    failures.push({
      file: loc ? loc[1] : '',
      line: loc ? parseInt(loc[2], 10) : 0,
      message: msgParts.join('\n'),
    })
  }
  return failures
}

function extractCargoAssertion(text: string): ExtractedFailure[] {
  const failures: ExtractedFailure[] = []
  const lines = text.split('\n')
  let inFailed = false
  let current: ExtractedFailure | null = null

  for (const line of lines) {
    if (RE_CARGO_FAIL_LINE.test(line)) {
      if (current) failures.push(current)
      inFailed = true
      current = { file: '', line: 0, testName: line.trim() }
      continue
    }
    if (inFailed && current) {
      const loc = line.match(RE_CARGO_LOCATION)
      if (loc) {
        current.file = loc[1]
        current.line = parseInt(loc[2], 10)
        current.message = loc[1]
        inFailed = false
        failures.push(current)
        current = null
        continue
      }
      if (RE_CARGO_PANIC.test(line)) {
        current.message = line.trim()
      }
    }
  }

  if (current) failures.push(current)
  return failures
}

/** Extract structured failure records from raw test output; auto-detects vitest/jest, pytest, go test, and cargo test formats. */
export function extractAllFailures(text: string): ExtractedFailure[] {
  const testType = detectTestType(text)
  switch (testType) {
    case 'pytest':
      return extractPytestAssertion(text)
    case 'go-test':
      return extractGoAssertion(text)
    case 'cargo-test':
      return extractCargoAssertion(text)
    case 'vitest':
    case 'jest':
    default:
      return extractJsAssertion(text)
  }
}

type TestType = 'vitest' | 'jest' | 'pytest' | 'go-test' | 'cargo-test' | 'unknown'

function detectTestType(text: string): TestType {
  if (/^=+.*test session starts.*=+/m.test(text) || /FAILED.*\.py/.test(text)) return 'pytest'
  if (/=== RUN\s/.test(text) || /^--- (FAIL|PASS):/m.test(text)) return 'go-test'
  if (/^test \S.* \.\.\. (ok|FAILED)$/m.test(text)) return 'cargo-test'
  if (/(PASS|FAIL)\s+.*\.(test|spec)\.\w+/m.test(text)) return 'jest'
  if (/^\s*(RUN|DEV)\s+v?\d|^\s*[✓×❯]\s.*\.(test|spec)\./m.test(text)) return 'vitest'
  return 'unknown'
}

export interface StructuredFailureSummary {
  text: string
  count: number
  files: string[]
}

/** Build a structured failure summary from raw test output, grouping failures by file with a formatted report string and total count. */
export function buildStructuredSummary(text: string): StructuredFailureSummary {
  const failures = extractAllFailures(text)
  if (failures.length === 0) return { text, count: 0, files: [] }

  const parts: string[] = [`TEST FAILURES (${failures.length}):`, '─────────────────────']
  const seenFiles = new Set<string>()

  for (let i = 0; i < failures.length; i++) {
    const f = failures[i]
    if (f.file) seenFiles.add(f.file)

    parts.push(`[${i + 1}]${f.testName ? ` ${f.testName}` : ''}`)
    if (f.file) parts.push(`    file: ${f.file}${f.line > 0 ? `:${f.line}` : ''}`)
    if (f.expected) parts.push(`    expected: ${f.expected}`)
    if (f.received) parts.push(`    received: ${f.received}`)
    if (f.message && !f.expected && !f.received) {
      parts.push(`    ${f.message}`)
    }
  }

  const out = parts.join('\n')
  if (out.length >= text.length) return { text, count: 0, files: [] }

  return {
    text: out,
    count: failures.length,
    files: Array.from(seenFiles),
  }
}
