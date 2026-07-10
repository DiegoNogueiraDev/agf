import { describe, it, expect } from 'vitest'
import { extractManagedBlock, replaceManagedBlock } from '../core/atomic-files/writer-markdown.js'

const FILE_ID = 'section-abc'
const START = `<!-- MCP-GRAPH:MANAGED-START:${FILE_ID} -->`
const END = `<!-- MCP-GRAPH:MANAGED-END:${FILE_ID} -->`

function makeContent(inner: string): string {
  return `# Document\n\n${START}\n${inner}\n${END}\n\n## After`
}

describe('extractManagedBlock', () => {
  it('returns null when markers are absent', () => {
    expect(extractManagedBlock('no markers here', FILE_ID)).toBeNull()
  })

  it('extracts the inner content between markers', () => {
    const inner = 'managed content here'
    const doc = makeContent(inner)
    expect(extractManagedBlock(doc, FILE_ID)).toBe(inner)
  })

  it('returns null when only start marker is present', () => {
    const doc = `${START}\nsome content`
    expect(extractManagedBlock(doc, FILE_ID)).toBeNull()
  })

  it('returns null when only end marker is present', () => {
    const doc = `some content\n${END}`
    expect(extractManagedBlock(doc, FILE_ID)).toBeNull()
  })

  it('returns null when end comes before start', () => {
    const doc = `${END}\ncontent\n${START}`
    expect(extractManagedBlock(doc, FILE_ID)).toBeNull()
  })

  it('handles different file IDs without conflict', () => {
    const otherId = 'other-section'
    const otherStart = `<!-- MCP-GRAPH:MANAGED-START:${otherId} -->`
    const otherEnd = `<!-- MCP-GRAPH:MANAGED-END:${otherId} -->`
    const doc = `${otherStart}\nother content\n${otherEnd}`
    expect(extractManagedBlock(doc, FILE_ID)).toBeNull()
    expect(extractManagedBlock(doc, otherId)).toBe('other content')
  })
})

describe('replaceManagedBlock', () => {
  it('replaces managed block with new content', () => {
    const doc = makeContent('old content')
    const result = replaceManagedBlock(doc, FILE_ID, 'new content')
    expect(result).toContain('new content')
    expect(result).not.toContain('old content')
  })

  it('preserves content before and after markers', () => {
    const doc = makeContent('inner')
    const result = replaceManagedBlock(doc, FILE_ID, 'replaced')
    expect(result).toContain('# Document')
    expect(result).toContain('## After')
  })

  it('returns original string when markers are not found', () => {
    const doc = 'no markers here at all'
    expect(replaceManagedBlock(doc, FILE_ID, 'new')).toBe(doc)
  })

  it('preserves start and end markers', () => {
    const doc = makeContent('old')
    const result = replaceManagedBlock(doc, FILE_ID, 'new body')
    expect(result).toContain(START)
    expect(result).toContain(END)
  })
})
