/*!
 * Task node_5fd6ac77d118 — LspDiagnosticsCollector tests.
 *
 * AC1: publishDiagnostics for a.ts → getForFile('a.ts') returns aggregated diagnostics.
 * AC2: publishDiagnostics with empty array after non-empty → reflects latest state (cleared).
 * AC3: suite passes.
 */

import { describe, it, expect } from 'vitest'
import { LspDiagnosticsCollector } from '../core/lsp/lsp-diagnostics.js'
import type { LspDiagnostic } from '../core/lsp/lsp-types.js'

const diag = (message: string, severity = 1): LspDiagnostic => ({
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
  message,
  severity,
})

describe('LspDiagnosticsCollector', () => {
  it('returns aggregated diagnostics for a file after onDiagnostics (AC1)', () => {
    const collector = new LspDiagnosticsCollector()
    collector.onDiagnostics('typescript', 'a.ts', [diag('error A'), diag('warning B', 2)])
    const result = collector.getForFile('a.ts')
    expect(result.length).toBe(2)
    expect(result.map((d) => d.message)).toContain('error A')
    expect(result.map((d) => d.message)).toContain('warning B')
  })

  it('reflects latest state — empty list clears previous diagnostics (AC2)', () => {
    const collector = new LspDiagnosticsCollector()
    collector.onDiagnostics('typescript', 'a.ts', [diag('old error')])
    collector.onDiagnostics('typescript', 'a.ts', [])
    const result = collector.getForFile('a.ts')
    expect(result.length).toBe(0)
  })

  it('aggregates diagnostics across multiple languages for the same file', () => {
    const collector = new LspDiagnosticsCollector()
    collector.onDiagnostics('typescript', 'a.ts', [diag('ts error')])
    collector.onDiagnostics('eslint', 'a.ts', [diag('lint warning', 2)])
    const result = collector.getForFile('a.ts')
    expect(result.length).toBe(2)
  })

  it('returns empty array for a file with no diagnostics', () => {
    const collector = new LspDiagnosticsCollector()
    expect(collector.getForFile('unknown.ts')).toEqual([])
  })
})
