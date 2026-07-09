/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { isBudgetLow, BUDGET_LOW_THRESHOLD } from '../core/hooks/agent-budget-precheck.js'

describe('agent-budget-precheck', () => {
  describe('isBudgetLow', () => {
    it('returns false when cap is undefined', () => {
      expect(isBudgetLow({ currentUsd: 90, capUsd: undefined })).toBe(false)
    })

    it('returns false when cap is zero', () => {
      expect(isBudgetLow({ currentUsd: 0, capUsd: 0 })).toBe(false)
    })

    it('returns false when cap is negative', () => {
      expect(isBudgetLow({ currentUsd: 0, capUsd: -1 })).toBe(false)
    })

    it('returns false when usage is below threshold', () => {
      expect(isBudgetLow({ currentUsd: 5, capUsd: 100 })).toBe(false)
    })

    it('returns true when usage exceeds threshold', () => {
      expect(isBudgetLow({ currentUsd: 95, capUsd: 100 })).toBe(true)
    })

    it('uses custom threshold', () => {
      expect(isBudgetLow({ currentUsd: 50, capUsd: 100 }, 0.4)).toBe(true)
      expect(isBudgetLow({ currentUsd: 30, capUsd: 100 }, 0.4)).toBe(false)
    })

    it('threshold boundary is exclusive', () => {
      const hits = []
      for (let i = 0; i < 10; i++) hits.push(i)
      expect(BUDGET_LOW_THRESHOLD).toBe(0.9)
      expect(isBudgetLow({ currentUsd: 90, capUsd: 100 })).toBe(false)
      expect(isBudgetLow({ currentUsd: 91, capUsd: 100 })).toBe(true)
    })
  })
})
