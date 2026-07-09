import { describe, it, expect } from 'vitest'
import { applySectionWithName } from '../core/docs/doc-updater.js'

const CONTENT = [
  '# Title',
  '<!-- mcp-graph:commands:start -->',
  'old content here',
  '<!-- mcp-graph:commands:end -->',
  '## Footer',
].join('\n')

describe('applySectionWithName', () => {
  it('replaces content between named markers', () => {
    const result = applySectionWithName(CONTENT, 'commands', 'new content')
    expect(result).toContain('new content')
    expect(result).not.toContain('old content here')
  })

  it('preserves content outside markers', () => {
    const result = applySectionWithName(CONTENT, 'commands', 'new')
    expect(result).toContain('# Title')
    expect(result).toContain('## Footer')
  })

  it('returns content unchanged when markers not found', () => {
    const result = applySectionWithName(CONTENT, 'nonexistent', 'new')
    expect(result).toBe(CONTENT)
  })

  it('preserves start marker in output', () => {
    const result = applySectionWithName(CONTENT, 'commands', 'replaced')
    expect(result).toContain('<!-- mcp-graph:commands:start -->')
  })

  it('preserves end marker in output', () => {
    const result = applySectionWithName(CONTENT, 'commands', 'replaced')
    expect(result).toContain('<!-- mcp-graph:commands:end -->')
  })

  it('handles empty new content', () => {
    const result = applySectionWithName(CONTENT, 'commands', '')
    expect(typeof result).toBe('string')
    expect(result).toContain('<!-- mcp-graph:commands:start -->')
  })
})
