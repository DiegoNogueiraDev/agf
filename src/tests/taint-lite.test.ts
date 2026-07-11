/*!
 * TDD: taint-lite — source-to-sink flow detection (node_0013636419bb).
 *
 * AC1: source reaches sink in N hops without sanitization → finding with path + confidence > 0
 * AC2: Zod parse / allowlist in path → no finding (or confidence reduced / mitigated)
 * AC3: no source→sink flow → zero findings
 */

import { describe, it, expect } from 'vitest'
import { analyzeTaint, type TaintFinding } from '../core/code/taint-lite.js'

// ── fixtures ─────────────────────────────────────────────────────────────────

const UNSAFE_EXEC = `
import { execSync } from 'node:child_process'
const name = process.argv[2]
execSync('ls ' + name)
`

const UNSAFE_REGEX = `
const pattern = JSON.parse(readFileSync('config.json', 'utf8')).pattern
const re = new RegExp(pattern)
`

const SAFE_ZOD = `
import { z } from 'zod'
const schema = z.string().regex(/^[a-z]+$/)
const name = schema.parse(process.argv[2])
execSync('ls ' + name)
`

const SAFE_ALLOW = `
const ALLOWED = ['a', 'b', 'c']
const name = process.argv[2]
if (!ALLOWED.includes(name)) throw new Error('bad')
execSync('ls ' + name)
`

const CLEAN = `
function add(a: number, b: number): number {
  return a + b
}
export { add }
`

// ─────────────────────────────────────────────────────────────────────────────

describe('taint-lite — AC1: source reaches sink', () => {
  it('process.argv → execSync without sanitization → finding (AC1)', () => {
    const findings = analyzeTaint(UNSAFE_EXEC, 'test.ts')
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].confidence).toBeGreaterThan(0)
    expect(findings[0].source).toBeTruthy()
    expect(findings[0].sink).toBeTruthy()
  })

  it('JSON.parse file → new RegExp → finding (AC1)', () => {
    const findings = analyzeTaint(UNSAFE_REGEX, 'test.ts')
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].confidence).toBeGreaterThan(0)
  })
})

describe('taint-lite — AC2: sanitized path → no finding', () => {
  it('Zod .parse() on argv before execSync → no finding (AC2)', () => {
    const findings = analyzeTaint(SAFE_ZOD, 'test.ts')
    // Either no findings, or confidence is reduced (< 0.5)
    const dangerous = findings.filter((f: TaintFinding) => f.confidence >= 0.5)
    expect(dangerous).toHaveLength(0)
  })

  it('allowlist check before exec → no finding (AC2)', () => {
    const findings = analyzeTaint(SAFE_ALLOW, 'test.ts')
    const dangerous = findings.filter((f: TaintFinding) => f.confidence >= 0.5)
    expect(dangerous).toHaveLength(0)
  })
})

describe('taint-lite — AC3: clean code → zero findings', () => {
  it('pure arithmetic function → zero findings (AC3)', () => {
    const findings = analyzeTaint(CLEAN, 'test.ts')
    expect(findings).toHaveLength(0)
  })
})
