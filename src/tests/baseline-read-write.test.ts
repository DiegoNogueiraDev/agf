/*!
 * Task node_ab7301a2f5df — baseline file read/write (versioned JSON next to fixtures).
 *
 * AC: Given --update-baseline, when run, then the baseline file equals the current scorecard.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeBaseline, readBaseline } from '../core/evals/economy-regression-gate.js'

const dir = mkdtempSync(join(tmpdir(), 'agf-baseline-'))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('baseline file read/write', () => {
  it('writeBaseline overwrites existing file with current scorecard (--update-baseline AC)', () => {
    const initial = { cheap: 0.001, build: 0.005 }
    writeBaseline(dir, initial)
    const updated = { cheap: 0.002, build: 0.01 }
    writeBaseline(dir, updated)
    const b = readBaseline(dir)
    expect(b?.costPerSuccess).toEqual(updated)
  })

  it('readBaseline returns null when no baseline file exists', () => {
    const empty = mkdtempSync(join(tmpdir(), 'agf-bl2-'))
    try {
      expect(readBaseline(empty)).toBeNull()
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('written baseline is valid JSON with createdAt field', () => {
    writeBaseline(dir, { cheap: 0.001 })
    const raw = readFileSync(join(dir, 'economy-baseline.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(typeof parsed.createdAt).toBe('string')
    expect(parsed.costPerSuccess.cheap).toBe(0.001)
  })
})
