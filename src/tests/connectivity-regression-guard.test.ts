/*!
 * TDD: connectivity-regression-guard — hook fires on new dormant capability (node_525dad177f03).
 *
 * AC1: done introducing new dormant → regression signal (warn).
 * AC2: done without new dormancy → silent (no false positive).
 * AC3: guard disabled via env → always passes (opt-out).
 */

import { describe, it, expect } from 'vitest'
import {
  checkConnectivityRegression,
  type ConnectivityRegressionInput,
} from '../core/hooks/connectivity-regression-guard.js'

describe('AC1: new dormant after done → regression detected', () => {
  it('returns regression=true when newDormant count increases', () => {
    const input: ConnectivityRegressionInput = {
      baselineDormantCount: 5,
      currentDormantCount: 6,
      disabled: false,
    }
    const result = checkConnectivityRegression(input)
    expect(result.regression).toBe(true)
    expect(result.newDormant).toBe(1)
  })

  it('includes new dormant files in result when provided', () => {
    const input: ConnectivityRegressionInput = {
      baselineDormantCount: 2,
      currentDormantCount: 3,
      baselineDormantFiles: ['src/core/a.ts', 'src/core/b.ts'],
      currentDormantFiles: ['src/core/a.ts', 'src/core/b.ts', 'src/core/c.ts'],
      disabled: false,
    }
    const result = checkConnectivityRegression(input)
    expect(result.regression).toBe(true)
    expect(result.addedFiles).toEqual(['src/core/c.ts'])
  })
})

describe('AC2: no new dormancy → silent pass', () => {
  it('returns regression=false when dormant count is unchanged', () => {
    const input: ConnectivityRegressionInput = {
      baselineDormantCount: 5,
      currentDormantCount: 5,
      disabled: false,
    }
    const result = checkConnectivityRegression(input)
    expect(result.regression).toBe(false)
    expect(result.newDormant).toBe(0)
  })

  it('returns regression=false when dormant count decreases (improvement)', () => {
    const input: ConnectivityRegressionInput = {
      baselineDormantCount: 5,
      currentDormantCount: 3,
      disabled: false,
    }
    const result = checkConnectivityRegression(input)
    expect(result.regression).toBe(false)
  })
})

describe('AC3: disabled via env → always passes', () => {
  it('returns regression=false when guard is disabled', () => {
    const input: ConnectivityRegressionInput = {
      baselineDormantCount: 5,
      currentDormantCount: 99,
      disabled: true,
    }
    const result = checkConnectivityRegression(input)
    expect(result.regression).toBe(false)
    expect(result.skipped).toBe(true)
  })
})
