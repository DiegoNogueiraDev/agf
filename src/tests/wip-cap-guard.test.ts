/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getWipCap } from '../core/hooks/wip-cap-guard.js'

describe('wip-cap-guard', () => {
  describe('getWipCap', () => {
    it('returns default 1 when env not set', () => {
      expect(getWipCap({})).toBe(1)
    })

    it('returns parsed value from env', () => {
      expect(getWipCap({ MCP_GRAPH_WIP_CAP: '3' })).toBe(3)
    })

    it('returns default for invalid value', () => {
      expect(getWipCap({ MCP_GRAPH_WIP_CAP: 'abc' })).toBe(1)
      expect(getWipCap({ MCP_GRAPH_WIP_CAP: '0' })).toBe(1)
      expect(getWipCap({ MCP_GRAPH_WIP_CAP: '-5' })).toBe(1)
    })

    it('returns default for NaN', () => {
      expect(getWipCap({ MCP_GRAPH_WIP_CAP: 'not-a-number' })).toBe(1)
    })
  })
})
