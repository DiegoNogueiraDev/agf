/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  calibrateCharsPerToken,
  estimateTokensCalibrated,
  DEFAULT_CHARS_PER_TOKEN,
} from '../core/context/zipf-estimator.js'

describe('calibrateCharsPerToken (Zipf-informed per-project ratio)', () => {
  it('recovers the true chars/token ratio from samples', () => {
    // Corpus where each token averages 3.5 chars.
    const samples = [
      { chars: 350, tokens: 100 },
      { chars: 700, tokens: 200 },
      { chars: 1050, tokens: 300 },
    ]
    expect(calibrateCharsPerToken(samples)).toBeCloseTo(3.5, 5)
  })

  it('is robust to a single outlier (median, not mean)', () => {
    const samples = [
      { chars: 350, tokens: 100 }, // 3.5
      { chars: 360, tokens: 100 }, // 3.6
      { chars: 3400, tokens: 100 }, // 34 — outlier
    ]
    const ratio = calibrateCharsPerToken(samples)
    expect(ratio).toBeGreaterThan(3.4)
    expect(ratio).toBeLessThan(3.7)
  })

  it('falls back to the default ratio when there are no usable samples', () => {
    expect(calibrateCharsPerToken([])).toBe(DEFAULT_CHARS_PER_TOKEN)
    expect(calibrateCharsPerToken([{ chars: 100, tokens: 0 }])).toBe(DEFAULT_CHARS_PER_TOKEN)
  })
})

describe('estimateTokensCalibrated', () => {
  it('beats the fixed chars/4 heuristic on a corpus with a different true ratio', () => {
    const trueRatio = 3.2
    const ratio = calibrateCharsPerToken([{ chars: 320, tokens: 100 }])

    const text = 'x'.repeat(640)
    const actual = Math.round(text.length / trueRatio) // 200
    const calibrated = estimateTokensCalibrated(text, ratio)
    const fixed = Math.ceil(text.length / DEFAULT_CHARS_PER_TOKEN) // 160

    expect(Math.abs(calibrated - actual)).toBeLessThan(Math.abs(fixed - actual))
  })

  it('floors at 1 token for non-empty text', () => {
    expect(estimateTokensCalibrated('a', 8)).toBe(1)
  })

  it('returns 0 for empty text', () => {
    expect(estimateTokensCalibrated('', 4)).toBe(0)
  })
})
