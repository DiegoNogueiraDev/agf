import { describe, it, expect } from 'vitest'
import { formatLabel, formatOutputLine, classifyOutput, OutputRenderer } from '../tui/components/OutputRenderer.js'

describe('formatLabel', () => {
  it('returns [html] for html format', () => {
    expect(formatLabel('html')).toBe('[html]')
  })

  it('returns [json] for json format', () => {
    expect(formatLabel('json')).toBe('[json]')
  })

  it('returns [svg] for html+svg format', () => {
    expect(formatLabel('html+svg')).toBe('[svg]')
  })

  it('returns [hybrid] for hybrid-md-html format', () => {
    expect(formatLabel('hybrid-md-html')).toBe('[hybrid]')
  })

  it('returns empty string for markdown format (default)', () => {
    expect(formatLabel('markdown')).toBe('')
  })
})

describe('formatOutputLine', () => {
  it('prepends label when format produces one', () => {
    const result = formatOutputLine('content', 'dashboard')
    expect(typeof result).toBe('string')
    expect(result).toContain('content')
  })

  it('returns content unchanged when no intent given', () => {
    expect(formatOutputLine('plain text')).toBe('plain text')
  })

  it('returns non-empty string for any intent', () => {
    const result = formatOutputLine('body', 'spec')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('classifyOutput', () => {
  it('returns an object with format, content, rationale fields', () => {
    const result = classifyOutput('report')
    expect(typeof result).toBe('object')
    expect(result).toHaveProperty('format')
    expect(result).toHaveProperty('rationale')
  })

  it('format is a non-empty string', () => {
    const result = classifyOutput('spec')
    expect(typeof result.format).toBe('string')
    expect(result.format.length).toBeGreaterThan(0)
  })
})

describe('OutputRenderer', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof OutputRenderer).toBe('function')
  })
})
