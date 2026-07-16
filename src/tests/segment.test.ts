import { describe, it, expect } from 'vitest'
import { segment, extractTableSections } from '../core/parser/segment.js'

const MARKDOWN = `# Title

First body.

## Section A

Content A.

### Sub-section

Sub content.

## Section B

Content B.
`

describe('segment', () => {
  it('returns empty array for empty string', () => {
    expect(segment('')).toHaveLength(0)
  })

  it('wraps plain text in a level-0 Untitled section', () => {
    const sections = segment('no headings here')
    expect(sections).toHaveLength(1)
    expect(sections[0].level).toBe(0)
    expect(sections[0].title).toBe('Untitled')
  })

  it('parses heading levels correctly', () => {
    const sections = segment(MARKDOWN)
    const title = sections.find((s) => s.title === 'Title')
    expect(title?.level).toBe(1)
    const subA = sections.find((s) => s.title === 'Sub-section')
    expect(subA?.level).toBe(3)
  })

  it('captures body text for each section', () => {
    const sections = segment(MARKDOWN)
    const a = sections.find((s) => s.title === 'Section A')
    expect(a?.body).toContain('Content A')
  })

  it('returns all sections found in document', () => {
    const sections = segment(MARKDOWN)
    expect(sections.length).toBeGreaterThanOrEqual(4)
  })
})

describe('extractTableSections', () => {
  it('returns input unchanged when no tables in body', () => {
    const sections = segment('## Header\n\nJust text\n')
    const result = extractTableSections(sections)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('extracts markdown table into a level-0 section', () => {
    const text = '## Header\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nAfter table\n'
    const sections = segment(text)
    const result = extractTableSections(sections)
    const tableSec = result.find((s) => s.title === '[table]')
    expect(tableSec).toBeTruthy()
    expect(tableSec?.level).toBe(0)
  })
})
