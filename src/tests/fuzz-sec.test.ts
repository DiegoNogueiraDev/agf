/*!
 * TDD: fuzz-sec adversarial input generator (node_f26f66aa19e6).
 *
 * AC1: Given an annotated boundary function, When fuzz-sec generates adversarial
 *      inputs, Then an unhandled crash/exception becomes a finding with the
 *      triggering input.
 * AC2: Given a robust function, When fuzzed, Then zero findings.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fuzzBoundary, runFuzzScan, type FuzzFinding } from '../core/harness/fuzz-sec.js'

// A fragile function that throws on shell-metacharacter inputs
function fragileParser(input: string): string {
  if (input.includes('`') || input.includes('$(')) {
    throw new Error('shell injection detected (unhandled)')
  }
  return input.trim()
}

// A robust function that always succeeds
function robustParser(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input))
  } catch {
    return ''
  }
}

describe('AC1: crash → finding with triggering input', () => {
  it('finds a crash in a fragile boundary function', () => {
    const findings: FuzzFinding[] = fuzzBoundary(fragileParser, { maxInputs: 50 })
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0]!.input).toBeDefined()
    expect(findings[0]!.error).toBeDefined()
  })

  it('finding includes the input that triggered the crash', () => {
    const findings = fuzzBoundary(fragileParser, { maxInputs: 50 })
    const triggering = findings[0]!.input as string
    expect(typeof triggering).toBe('string')
    expect(triggering.length).toBeGreaterThan(0)
  })
})

describe('AC2: robust function → zero findings', () => {
  it('finds no crashes in a robust boundary function', () => {
    const findings = fuzzBoundary(robustParser, { maxInputs: 50 })
    expect(findings).toEqual([])
  })
})

describe('runFuzzScan: wires fuzzBoundary to a real module on disk (node_wire_82163497add6)', () => {
  it('fuzzes every single-arg exported function and reports crashes by function name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-fuzz-scan-'))
    try {
      const modulePath = join(dir, 'boundary.mjs')
      writeFileSync(
        modulePath,
        [
          'export function fragile(input) {',
          "  if (input.includes('`')) throw new Error('shell injection detected')",
          '  return input',
          '}',
          'export function robust(input) { return String(input).length }',
        ].join('\n'),
      )

      const result = await runFuzzScan(dir, 'boundary.mjs', { maxInputs: 50 })

      expect(result.functionsScanned).toEqual(expect.arrayContaining(['fragile', 'robust']))
      expect(result.findings.some((f) => f.fn === 'fragile')).toBe(true)
      expect(result.findings.some((f) => f.fn === 'robust')).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('adversarial corpus variety', () => {
  it('generates shell-metacharacter payloads', () => {
    let seenShell = false
    fuzzBoundary(
      (s: string) => {
        if (s.includes('`') || s.includes('$(') || s.includes(';')) seenShell = true
        return s
      },
      { maxInputs: 100 },
    )
    expect(seenShell).toBe(true)
  })

  it('generates ReDoS-pattern payloads', () => {
    let seenRedos = false
    fuzzBoundary(
      (s: string) => {
        if (s.includes('aaa') || s.match(/a{10,}/)) seenRedos = true
        return s
      },
      { maxInputs: 100 },
    )
    expect(seenRedos).toBe(true)
  })
})
