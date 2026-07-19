/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { createSharedFindings } from '../core/autonomy/shared-findings.js'

describe('createSharedFindings', () => {
  it('adds a new finding and reports it present', () => {
    // arrange
    const findings = createSharedFindings()

    // act
    const added = findings.add('x')

    // assert
    expect(added).toBe(true)
    expect(findings.has('x')).toBe(true)
    expect(findings.all()).toHaveLength(1)
  })

  it('dedups by content hash — second add of same content returns false', () => {
    // arrange
    const findings = createSharedFindings()

    // act
    const first = findings.add('x')
    const second = findings.add('x')

    // assert
    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(findings.all()).toHaveLength(1)
  })

  it('keeps distinct contents as separate entries', () => {
    // arrange
    const findings = createSharedFindings()

    // act
    findings.add('alpha')
    findings.add('beta')

    // assert
    expect(findings.all()).toHaveLength(2)
    expect(findings.has('alpha')).toBe(true)
    expect(findings.has('beta')).toBe(true)
    expect(findings.has('gamma')).toBe(false)
  })

  it('exposes a deterministic content key (sha256) per finding', () => {
    // arrange
    const findings = createSharedFindings()

    // act
    findings.add('discovery')
    const [entry] = findings.all()

    // assert
    expect(entry.content).toBe('discovery')
    expect(entry.key).toMatch(/^[0-9a-f]{64}$/)
  })
})
