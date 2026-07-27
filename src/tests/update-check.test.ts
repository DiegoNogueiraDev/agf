/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { shouldCheckForUpdates } from '../core/utils/update-check.js'

describe('shouldCheckForUpdates', () => {
  it('should return true when no env vars are set', () => {
    expect(shouldCheckForUpdates({})).toBe(true)
  })

  it('should return false when MCP_GRAPH_NO_UPDATE_CHECK=1', () => {
    expect(shouldCheckForUpdates({ MCP_GRAPH_NO_UPDATE_CHECK: '1' })).toBe(false)
  })

  it('should return false when MCP_GRAPH_NO_UPDATE_CHECK=true', () => {
    expect(shouldCheckForUpdates({ MCP_GRAPH_NO_UPDATE_CHECK: 'true' })).toBe(false)
  })

  it('should return false when CI=true', () => {
    expect(shouldCheckForUpdates({ CI: 'true' })).toBe(false)
  })

  it('should return true when CI=false', () => {
    expect(shouldCheckForUpdates({ CI: 'false' })).toBe(true)
  })

  it('should prioritize MCP_GRAPH_NO_UPDATE_CHECK over CI', () => {
    expect(shouldCheckForUpdates({ MCP_GRAPH_NO_UPDATE_CHECK: '1', CI: 'true' })).toBe(false)
  })

  it('should return true for other MCP_GRAPH_NO_UPDATE_CHECK values', () => {
    expect(shouldCheckForUpdates({ MCP_GRAPH_NO_UPDATE_CHECK: '0' })).toBe(true)
    expect(shouldCheckForUpdates({ MCP_GRAPH_NO_UPDATE_CHECK: 'false' })).toBe(true)
  })
})
