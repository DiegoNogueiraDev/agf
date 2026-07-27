/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_07962a51d914 — C78-T1: tests for hooksDisabled function
 *
 * AC: hooksDisabled returns boolean; does not throw; blast gate passes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { hooksDisabled } from '../core/hooks/hook-runtime.js'

describe('hooksDisabled', () => {
  let savedHooksDisabled: string | undefined
  let savedAgfHooks: string | undefined

  beforeEach(() => {
    savedHooksDisabled = process.env['MCP_GRAPH_HOOKS_DISABLED']
    savedAgfHooks = process.env['AGF_HOOKS']
    delete process.env['MCP_GRAPH_HOOKS_DISABLED']
    delete process.env['AGF_HOOKS']
  })

  afterEach(() => {
    if (savedHooksDisabled !== undefined) {
      process.env['MCP_GRAPH_HOOKS_DISABLED'] = savedHooksDisabled
    } else {
      delete process.env['MCP_GRAPH_HOOKS_DISABLED']
    }
    if (savedAgfHooks !== undefined) {
      process.env['AGF_HOOKS'] = savedAgfHooks
    } else {
      delete process.env['AGF_HOOKS']
    }
  })

  it('returns a boolean', () => {
    const result = hooksDisabled()
    expect(typeof result).toBe('boolean')
  })

  it('does not throw when called without env vars', () => {
    expect(() => hooksDisabled()).not.toThrow()
  })

  it('returns false when no disable env vars are set', () => {
    expect(hooksDisabled()).toBe(false)
  })

  it('returns true when MCP_GRAPH_HOOKS_DISABLED=true', () => {
    process.env['MCP_GRAPH_HOOKS_DISABLED'] = 'true'
    expect(hooksDisabled()).toBe(true)
  })

  it('returns false when MCP_GRAPH_HOOKS_DISABLED=false', () => {
    process.env['MCP_GRAPH_HOOKS_DISABLED'] = 'false'
    expect(hooksDisabled()).toBe(false)
  })

  it('returns true when AGF_HOOKS=0', () => {
    process.env['AGF_HOOKS'] = '0'
    expect(hooksDisabled()).toBe(true)
  })

  it('returns false when AGF_HOOKS=1', () => {
    process.env['AGF_HOOKS'] = '1'
    expect(hooksDisabled()).toBe(false)
  })

  it('MCP_GRAPH_HOOKS_DISABLED=true takes precedence (both set)', () => {
    process.env['MCP_GRAPH_HOOKS_DISABLED'] = 'true'
    process.env['AGF_HOOKS'] = '1'
    expect(hooksDisabled()).toBe(true)
  })
})
