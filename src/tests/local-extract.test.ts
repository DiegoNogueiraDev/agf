import { describe, it, expect } from 'vitest'
import { parseApropos, parseBuiltins, parseHelpOutput, filterToEnvironment } from '../core/rag-in/local-extract.js'

describe('parseApropos', () => {
  it('returns empty for empty input', () => {
    expect(parseApropos('')).toHaveLength(0)
  })

  it('parses Linux-style apropos line', () => {
    const out = 'tar (1) - Manipulate tape archives'
    const chunks = parseApropos(out)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0]?.tool).toBe('tar')
  })

  it('parses macOS-style apropos line', () => {
    const out = 'ls(1) - List directory contents'
    const chunks = parseApropos(out)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0]?.tool).toBe('ls')
  })

  it('deduplicates ids for repeated tools', () => {
    const out = 'ls(1) - List\nls(1) - List again'
    const chunks = parseApropos(out)
    const ids = chunks.map((c) => c.id)
    const unique = new Set(ids)
    expect(ids.length).toBe(unique.size)
  })
})

describe('parseBuiltins', () => {
  it('returns empty for empty input', () => {
    expect(parseBuiltins('')).toHaveLength(0)
  })

  it('parses one builtin per line', () => {
    const out = 'echo\ncd\npwd'
    const chunks = parseBuiltins(out)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]?.tool).toBe('echo')
  })
})

describe('parseHelpOutput', () => {
  it('returns null for empty help output', () => {
    expect(parseHelpOutput('', 'git')).toBeNull()
  })

  it('returns a chunk for non-empty help', () => {
    const help = 'Usage: git [options]\nThe main git tool'
    const chunk = parseHelpOutput(help, 'git')
    expect(chunk).not.toBeNull()
    expect(chunk?.tool).toBe('git')
  })
})

describe('filterToEnvironment', () => {
  const harness = {
    id: 'h1',
    tool: 'agf',
    intent: 'run graph',
    command: 'agf run',
    family: 'harness' as const,
    flags_explained: '',
    danger: false,
    source: 'builtin',
  }
  const local = {
    id: 'l1',
    tool: 'tar',
    intent: 'archive',
    command: 'tar',
    family: 'unix' as const,
    flags_explained: '',
    danger: false,
    source: 'local-man',
  }

  it('includes harness chunks regardless of available set', () => {
    const result = filterToEnvironment([harness], new Set())
    expect(result).toHaveLength(1)
  })

  it('includes local chunk when tool is in available set', () => {
    const result = filterToEnvironment([local], new Set(['tar']))
    expect(result).toHaveLength(1)
  })

  it('excludes local chunk when tool is not in available set', () => {
    const result = filterToEnvironment([local], new Set())
    expect(result).toHaveLength(0)
  })
})
