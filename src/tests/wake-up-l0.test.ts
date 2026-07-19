/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { estimateTokens } from '../core/context/token-estimator.js'
import { buildL0Identity, type L0IdentityData } from '../core/economy/wake-up-l0.js'

const sampleData: L0IdentityData = {
  projectName: 'mcp-graph',
  identity: 'AI agent for software engineering with persistent graph-based execution tracking',
  coreRules: [
    'TDD Red-Green-Refactor mandatory',
    'All changes tracked in graph',
    'Anti-one-shot: decompose into atomic tasks',
  ],
  knowledgeAnchors: ['AGENTS.md contains all project rules', 'mcp-graph tools in workflow-graph/'],
}

describe('buildL0Identity', () => {
  it('stays within 100 token budget', () => {
    const result = buildL0Identity(sampleData)
    expect(estimateTokens(result.content)).toBeLessThanOrEqual(100)
  })

  it('includes project identity', () => {
    const result = buildL0Identity(sampleData)
    expect(result.content).toContain('mcp-graph')
    expect(result.content).toContain('software engineering')
  })

  it('includes core rules', () => {
    const result = buildL0Identity(sampleData)
    expect(result.content).toContain('TDD')
    expect(result.content).toContain('atomic tasks')
  })

  it('includes knowledge anchors', () => {
    const result = buildL0Identity(sampleData)
    expect(result.content).toContain('AGENTS.md')
  })

  it('reports token count correctly', () => {
    const result = buildL0Identity(sampleData)
    expect(result.tokenCount).toBe(estimateTokens(result.content))
    expect(result.tokenCount).toBeLessThanOrEqual(100)
  })

  it('reports truncation when data exceeds budget', () => {
    const hugeData: L0IdentityData = {
      projectName: 'x',
      identity: 'x',
      coreRules: Array.from({ length: 50 }, (_, i) =>
        `core rule number ${i} with lots of text to force truncation `.repeat(5),
      ),
      knowledgeAnchors: Array.from({ length: 50 }, (_, i) =>
        `knowledge anchor ${i} with lots of filler text `.repeat(5),
      ),
    }
    const result = buildL0Identity(hugeData)
    expect(result.tokenCount).toBeLessThanOrEqual(100)
    expect(result.truncated).toBe(true)
  })

  it('handles minimal data', () => {
    const minimal: L0IdentityData = {
      projectName: 'test',
      identity: 'minimal agent',
      coreRules: [],
      knowledgeAnchors: [],
    }
    const result = buildL0Identity(minimal)
    expect(result.tokenCount).toBeGreaterThan(0)
    expect(result.tokenCount).toBeLessThanOrEqual(100)
    expect(result.truncated).toBe(false)
  })

  it('prioritizes identity over anchors when truncating', () => {
    const hugeAnchors: L0IdentityData = {
      projectName: 'p',
      identity: 'core identity that must always appear',
      coreRules: ['rule one'],
      knowledgeAnchors: Array.from({ length: 30 }, (_, i) => `anchor ${i}: `.repeat(10)),
    }
    const result = buildL0Identity(hugeAnchors)
    expect(result.content).toContain('core identity')
    expect(result.truncated).toBe(true)
  })

  it('output is deterministic', () => {
    const a = buildL0Identity(sampleData)
    const b = buildL0Identity(sampleData)
    expect(a.content).toBe(b.content)
  })
})
