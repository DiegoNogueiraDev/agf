import { describe, it, expect } from 'vitest'
import {
  COMPRESSION_PRIORITIES,
  COMPACT_RULES,
  COMPACT_TEMPLATE,
  XML_COMPACT_TEMPLATE,
  buildCompactPrompt,
  buildXmlCompactPrompt,
  escXml,
  buildXmlCompactOutput,
} from '../core/context/compact-template.js'

describe('COMPRESSION_PRIORITIES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(COMPRESSION_PRIORITIES)).toBe(true)
    expect(COMPRESSION_PRIORITIES.length).toBeGreaterThan(0)
  })

  it('each entry has priority, rule, description', () => {
    for (const p of COMPRESSION_PRIORITIES) {
      expect(typeof p.priority).toBe('number')
      expect(typeof p.rule).toBe('string')
      expect(typeof p.description).toBe('string')
    }
  })

  it('priorities are ordered ascending', () => {
    const priorities = COMPRESSION_PRIORITIES.map((p) => p.priority)
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i]).toBeGreaterThan(priorities[i - 1])
    }
  })
})

describe('COMPACT_RULES', () => {
  it('has keep_errors rule', () => {
    expect(typeof COMPACT_RULES.keep_errors).toBe('string')
    expect(COMPACT_RULES.keep_errors.length).toBeGreaterThan(0)
  })

  it('has merge_similar rule', () => {
    expect(typeof COMPACT_RULES.merge_similar).toBe('string')
  })

  it('has remove_redundant rule', () => {
    expect(typeof COMPACT_RULES.remove_redundant).toBe('string')
  })

  it('has condense_code rule', () => {
    expect(typeof COMPACT_RULES.condense_code).toBe('string')
  })
})

describe('COMPACT_TEMPLATE', () => {
  it('is a non-empty string', () => {
    expect(typeof COMPACT_TEMPLATE).toBe('string')
    expect(COMPACT_TEMPLATE.length).toBeGreaterThan(0)
  })

  it('contains Session Compact heading', () => {
    expect(COMPACT_TEMPLATE).toContain('Session Compact')
  })
})

describe('XML_COMPACT_TEMPLATE', () => {
  it('is a non-empty string', () => {
    expect(typeof XML_COMPACT_TEMPLATE).toBe('string')
    expect(XML_COMPACT_TEMPLATE.length).toBeGreaterThan(0)
  })
})

describe('buildCompactPrompt', () => {
  it('returns a string containing the context', () => {
    const result = buildCompactPrompt('my context')
    expect(result).toContain('my context')
  })

  it('contains the COMPACT_TEMPLATE', () => {
    const result = buildCompactPrompt('ctx')
    expect(result).toContain('Session Compact')
  })

  it('is deterministic', () => {
    expect(buildCompactPrompt('abc')).toBe(buildCompactPrompt('abc'))
  })
})

describe('buildXmlCompactPrompt', () => {
  it('returns a string containing the context', () => {
    const result = buildXmlCompactPrompt('xml context')
    expect(result).toContain('xml context')
  })

  it('contains compression priority references', () => {
    const result = buildXmlCompactPrompt('ctx')
    expect(result).toContain('keep_errors')
  })
})

describe('escXml', () => {
  it('escapes ampersand', () => {
    expect(escXml('a&b')).toBe('a&amp;b')
  })

  it('escapes less-than', () => {
    expect(escXml('a<b')).toBe('a&lt;b')
  })

  it('escapes greater-than', () => {
    expect(escXml('a>b')).toBe('a&gt;b')
  })

  it('escapes double quotes', () => {
    expect(escXml('a"b')).toBe('a&quot;b')
  })

  it('returns plain text unchanged', () => {
    expect(escXml('hello world')).toBe('hello world')
  })
})

describe('buildXmlCompactOutput', () => {
  it('returns a string', () => {
    const result = buildXmlCompactOutput({})
    expect(typeof result).toBe('string')
  })

  it('wraps in compact-prompt tags', () => {
    const result = buildXmlCompactOutput({})
    expect(result).toContain('<compact-prompt>')
    expect(result).toContain('</compact-prompt>')
  })

  it('renders currentFocus when provided', () => {
    const result = buildXmlCompactOutput({
      currentFocus: { taskId: 't1', title: 'My Task', status: 'in_progress' },
    })
    expect(result).toContain('My Task')
    expect(result).toContain('t1')
    expect(result).toContain('in_progress')
  })

  it('renders completedTasks', () => {
    const result = buildXmlCompactOutput({
      completedTasks: [{ id: 'c1', title: 'Done Task', result: 'ok' }],
    })
    expect(result).toContain('Done Task')
    expect(result).toContain('c1')
  })

  it('renders activeIssues', () => {
    const result = buildXmlCompactOutput({
      activeIssues: [{ severity: 'high', description: 'Something broke' }],
    })
    expect(result).toContain('Something broke')
    expect(result).toContain('high')
  })

  it('escapes xml in fields', () => {
    const result = buildXmlCompactOutput({
      currentFocus: { taskId: 't1', title: 'Task <A> & "B"', status: 'done' },
    })
    expect(result).toContain('&lt;A&gt;')
    expect(result).toContain('&amp;')
    expect(result).toContain('&quot;B&quot;')
  })
})
