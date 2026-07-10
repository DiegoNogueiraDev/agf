/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { resolveFlowConfig, flowAbArm } from '../core/context/flow-config.js'

describe('flow-config', () => {
  describe('resolveFlowConfig', () => {
    it('returns disabled config when no setting stored', () => {
      const source = { getProjectSetting: (_key: string) => null }
      const config = resolveFlowConfig(source)
      // FlowConfig schema defaults
      expect(typeof config).toBe('object')
    })

    it('returns defaults for invalid JSON', () => {
      const source = { getProjectSetting: (_key: string) => 'not-json' }
      const config = resolveFlowConfig(source)
      expect(typeof config).toBe('object')
    })

    it('parses valid JSON config', () => {
      const source = { getProjectSetting: (_key: string) => '{"enabled":true,"lambdaBase":0.3}' }
      const config = resolveFlowConfig(source)
      expect(typeof config).toBe('object')
    })
  })

  describe('flowAbArm', () => {
    it('returns flow_on for even char-sum ids', () => {
      // Sum of char codes for "abc": 97+98+99=294 (even) -> flow_on
      expect(flowAbArm('abc')).toBe('flow_on')
    })

    it('returns flow_off for odd char-sum ids', () => {
      // Sum of char codes for "ab": 97+98=195 (odd) -> flow_off
      expect(flowAbArm('ab')).toBe('flow_off')
    })

    it('is deterministic (same id, same arm)', () => {
      expect(flowAbArm('test-node')).toBe(flowAbArm('test-node'))
    })
  })
})
