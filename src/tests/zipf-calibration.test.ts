/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Persistence for the Zipf-calibrated chars/token ratio (`zipf_estimate` lever):
 * default until calibrated, then the stored median ratio.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import {
  getCalibratedCharsPerToken,
  updateZipfCalibration,
  ZIPF_CHARS_PER_TOKEN_KEY,
} from '../core/context/zipf-calibration.js'
import { DEFAULT_CHARS_PER_TOKEN } from '../core/context/zipf-estimator.js'

describe('zipf-calibration', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('zipf-test')
  })
  afterEach(() => store.close())

  it('returns the default ratio when unset', () => {
    expect(getCalibratedCharsPerToken(store)).toBe(DEFAULT_CHARS_PER_TOKEN)
  })

  it('falls back to the default on an invalid stored value', () => {
    store.setProjectSetting(ZIPF_CHARS_PER_TOKEN_KEY, 'not-a-number')
    expect(getCalibratedCharsPerToken(store)).toBe(DEFAULT_CHARS_PER_TOKEN)
  })

  it('calibrates from samples and persists the median chars/token ratio', () => {
    // chars/tokens = 5 across the samples ⇒ median 5.
    const ratio = updateZipfCalibration(store, [
      { chars: 100, tokens: 20 },
      { chars: 50, tokens: 10 },
      { chars: 250, tokens: 50 },
    ])
    expect(ratio).toBeCloseTo(5, 5)
    expect(getCalibratedCharsPerToken(store)).toBeCloseTo(5, 5)
  })

  it('stores the default when no usable sample is given', () => {
    const ratio = updateZipfCalibration(store, [{ chars: 0, tokens: 0 }])
    expect(ratio).toBe(DEFAULT_CHARS_PER_TOKEN)
  })
})
