/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { checkDestructiveDbIntent, DESTRUCTIVE_DB_CONFIRM_PHRASE } from '../core/hooks/destructive-db-guard.js'

describe('destructive-db-guard', () => {
  it('returns safe for empty string', () => {
    const r = checkDestructiveDbIntent('')
    expect(r.blocked).toBe(false)
  })

  it('returns blocked for rm graph.db', () => {
    const r = checkDestructiveDbIntent('rm workflow-graph/graph.db')
    expect(r.blocked).toBe(true)
    expect(r.matchedPattern).toContain('rm graph.db')
  })

  it('returns blocked for rm workflow-graph dir', () => {
    const r = checkDestructiveDbIntent('rm -rf workflow-graph/')
    expect(r.blocked).toBe(true)
    expect(r.matchedPattern).toContain('rm workflow-graph')
  })

  it('returns blocked for DROP TABLE nodes', () => {
    const r = checkDestructiveDbIntent('DROP TABLE nodes;')
    expect(r.blocked).toBe(true)
    expect(r.matchedPattern).toContain('DROP TABLE')
  })

  it('returns blocked for DELETE FROM without WHERE', () => {
    const r = checkDestructiveDbIntent('DELETE FROM nodes;')
    expect(r.blocked).toBe(true)
    expect(r.matchedPattern).toContain('DELETE FROM')
  })

  it('returns blocked for TRUNCATE nodes', () => {
    const r = checkDestructiveDbIntent('TRUNCATE nodes')
    expect(r.blocked).toBe(true)
    expect(r.matchedPattern).toContain('TRUNCATE')
  })

  it('returns blocked for init --force', () => {
    const r = checkDestructiveDbIntent('mcp-graph init --force')
    expect(r.blocked).toBe(true)
  })

  it('returns blocked for PT-BR apagar banco', () => {
    const r = checkDestructiveDbIntent('apague o banco do mcp-graph')
    expect(r.blocked).toBe(true)
  })

  it('returns blocked for EN wipe intent', () => {
    const r = checkDestructiveDbIntent('wipe the mcp-graph database')
    expect(r.blocked).toBe(true)
  })

  it('returns blocked for "começar do zero"', () => {
    const r = checkDestructiveDbIntent('começar do zero no mcp-graph')
    expect(r.blocked).toBe(true)
  })

  it('bypasses when confirmation phrase is present', () => {
    const text = `rm workflow-graph/graph.db ${DESTRUCTIVE_DB_CONFIRM_PHRASE}`
    const r = checkDestructiveDbIntent(text)
    expect(r.blocked).toBe(false)
  })

  it('bypasses when confirmedPhrase arg is provided', () => {
    const r = checkDestructiveDbIntent('rm workflow-graph/graph.db', DESTRUCTIVE_DB_CONFIRM_PHRASE)
    expect(r.blocked).toBe(false)
  })

  it('returns safe for harmless text', () => {
    const r = checkDestructiveDbIntent('echo hello world')
    expect(r.blocked).toBe(false)
  })
})
