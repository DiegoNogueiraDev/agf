/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * task-policy-rendering — surface-decide engine + output format routing tests.
 *
 * Tests the deterministic format decision engine adapted from surface-skill
 * and the TUI output routing that renders results in the appropriate format.
 */
import { describe, it, expect } from 'vitest'
import { decide, type Signals, type Decision, type Policy } from '../tui/surface-decide.js'

const POLICY: Policy = {
  version: 1,
  rules: [
    {
      name: 'Code review for humans → html',
      match: { intent: 'code-review', consumer: ['human-once', 'human-archive'] },
      decide: { format: 'html', reason: 'Diffs need color, anchoring, and inline annotations.' },
    },
    {
      name: 'Dashboard for humans → html',
      match: { intent: 'dashboard', consumer: ['human-once', 'human-archive'] },
      decide: { format: 'html', reason: 'Dashboards are interfaces, not reports.' },
    },
    {
      name: 'Spec for next agent → hybrid',
      match: { intent: 'spec', consumer: 'agent-next' },
      decide: { format: 'hybrid-md-html', reason: 'Next-step agents read MD well.' },
    },
    {
      name: 'Large spec for humans → html',
      match: { intent: 'spec', consumer: ['human-once', 'human-archive'], size: 'large' },
      decide: { format: 'html', reason: 'Past 100 lines, MD specs become walls of text.' },
    },
    {
      name: 'Spec for humans → markdown',
      match: { intent: 'spec', consumer: ['human-once', 'human-archive'], size: ['small', 'medium'] },
      decide: { format: 'markdown', reason: 'Specs that fit on a screen scan fine as Markdown.' },
    },
    {
      name: 'Data extraction → json',
      match: { intent: 'data-extract' },
      decide: { format: 'json', reason: 'Structured data goes in structured containers.' },
    },
    {
      name: 'Doc for humans → markdown',
      match: { intent: 'doc', consumer: ['human-once', 'human-archive'] },
      decide: { format: 'markdown', reason: 'Reference material stays portable.' },
    },
    {
      name: 'Report for humans → markdown',
      match: { intent: 'report', consumer: ['human-once', 'human-archive'] },
      decide: { format: 'markdown', reason: 'Reports default to MD.' },
    },
    {
      name: 'Default fallback',
      match: '*',
      decide: { format: 'markdown', reason: 'Conservative default.' },
    },
  ],
  prompts: {
    markdown: 'Generate clean GitHub-flavored Markdown.',
    html: 'Generate self-contained HTML5.',
    'html+svg': 'Generate HTML with inline SVG.',
    json: 'Output a single JSON object.',
    'hybrid-md-html': 'Markdown with embedded HTML blocks.',
  },
}

describe('surface-decide: decide()', () => {
  it('routes code-review for humans → html', () => {
    const signals: Signals = { intent: 'code-review', consumer: 'human-once' }
    const result = decide(signals, POLICY)
    expect(result.format).toBe('html')
    expect(result.matchedRule).toBe('Code review for humans → html')
    expect(result.rationale).toContain('Diffs need color')
  })

  it('routes spec for humans (small) → markdown', () => {
    const signals: Signals = { intent: 'spec', consumer: 'human-once', size: 'small' }
    const result = decide(signals, POLICY)
    expect(result.format).toBe('markdown')
    expect(result.matchedRule).toBe('Spec for humans → markdown')
  })

  it('routes spec for humans (large) → html', () => {
    const signals: Signals = { intent: 'spec', consumer: 'human-once', size: 'large' }
    const result = decide(signals, POLICY)
    expect(result.format).toBe('html')
    expect(result.matchedRule).toBe('Large spec for humans → html')
  })

  it('routes data-extract → json', () => {
    const signals: Signals = { intent: 'data-extract' }
    const result = decide(signals, POLICY)
    expect(result.format).toBe('json')
  })

  it('routes doc for humans → markdown', () => {
    const signals: Signals = { intent: 'doc', consumer: 'human-archive' }
    const result = decide(signals, POLICY)
    expect(result.format).toBe('markdown')
  })

  it('routes dashboard → html', () => {
    const signals: Signals = { intent: 'dashboard', consumer: 'human-once' }
    const result = decide(signals, POLICY)
    expect(result.format).toBe('html')
  })

  it('routes spec for agent → hybrid', () => {
    const signals: Signals = { intent: 'spec', consumer: 'agent-next' }
    const result = decide(signals, POLICY)
    expect(result.format).toBe('hybrid-md-html')
  })

  it('uses default fallback for unknown intent', () => {
    const signals: Signals = { intent: 'scratchpad' as Signals['intent'] }
    const result = decide(signals, POLICY)
    expect(result.format).toBe('markdown')
    expect(result.matchedRule).toBe('Default fallback')
  })

  it('returns promptPrefix for each format', () => {
    const signals: Signals = { intent: 'code-review', consumer: 'human-once' }
    const result = decide(signals, POLICY)
    expect(result.promptPrefix).toContain('HTML5')
  })

  it('throws when no default fallback exists', () => {
    const noFallback: Policy = { version: 1, rules: [], prompts: POLICY.prompts }
    expect(() => decide({ intent: 'spec' }, noFallback)).toThrow('no matching rule')
  })
})

describe('surface-decide: rule matching semantics', () => {
  it('first match wins (order matters)', () => {
    const policy: Policy = {
      version: 1,
      rules: [
        { name: 'first', match: { intent: 'spec' }, decide: { format: 'json', reason: '' } },
        { name: 'second', match: { intent: 'spec', consumer: 'human-once' }, decide: { format: 'html', reason: '' } },
        { name: 'fallback', match: '*', decide: { format: 'markdown', reason: '' } },
      ],
      prompts: POLICY.prompts,
    }
    // "spec" matches first rule → json
    const result = decide({ intent: 'spec', consumer: 'human-once' }, policy)
    expect(result.format).toBe('json')
    expect(result.matchedRule).toBe('first')
  })

  it('omitted field matches any value (wildcard)', () => {
    const policy: Policy = {
      version: 1,
      rules: [
        { name: 'only intent', match: { intent: 'code-review' }, decide: { format: 'html', reason: '' } },
        { name: 'fallback', match: '*', decide: { format: 'markdown', reason: '' } },
      ],
      prompts: POLICY.prompts,
    }
    // code-review without consumer still matches
    const result = decide({ intent: 'code-review' }, policy)
    expect(result.format).toBe('html')
  })

  it('array criterion matches any value in the list', () => {
    const result = decide({ intent: 'spec', consumer: 'human-archive', size: 'medium' }, POLICY)
    expect(result.format).toBe('markdown')
    expect(result.matchedRule).toBe('Spec for humans → markdown')
  })
})

describe('surface-decide: output routing (TUI adaptation)', () => {
  it('routes by format for terminal display', () => {
    const signals: Signals = { intent: 'code-review', consumer: 'human-once' }
    const { format, rationale } = decide(signals, POLICY)
    expect(format).toBe('html')
    // In terminal (Ink), HTML-format outputs get colored diff rendering
    // This test verifies the routing, not the rendering
    expect(typeof rationale).toBe('string')
  })

  it('routes data output to structured display', () => {
    const signals: Signals = { intent: 'data-extract' }
    const { format } = decide(signals, POLICY)
    expect(format).toBe('json')
  })
})
