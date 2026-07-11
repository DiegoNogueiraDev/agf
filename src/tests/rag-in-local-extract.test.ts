import { describe, it, expect } from 'vitest'
import {
  parseApropos,
  parseBuiltins,
  parseHelpOutput,
  parseGetCommand,
  filterToEnvironment,
  extractLocalCorpus,
  mergeLocalCorpus,
  type LocalRunner,
} from '../core/rag-in/local-extract.js'
import type { CommandChunk } from '../core/rag-in/command-chunk.js'

describe('parseApropos', () => {
  const OUT = `tar (1)              - manipulate tape archives
grep (1)             - print lines matching a pattern
git-commit (1)       - Record changes to the repository
zzz (8)              - some admin tool`

  it('parses tool + intent per line', () => {
    const chunks = parseApropos(OUT)
    expect(chunks.length).toBe(4)
    const tar = chunks.find((c) => c.tool === 'tar')!
    expect(tar.intent.toLowerCase()).toContain('tape archives')
    expect(tar.command).toBe('tar')
    expect(tar.family).toBe('unix')
    expect(tar.source).toBe('local-man')
  })

  it('never emits an empty tool/command', () => {
    const chunks = parseApropos(OUT + '\ngarbage line without paren')
    expect(chunks.every((c) => c.tool.length > 0 && c.command.length > 0)).toBe(true)
  })

  it('parses the macOS format with no space before the section (tar(1) - …)', () => {
    const chunks = parseApropos('tar(1) - manipulate tape archives\ngrep(1) - pattern search')
    expect(chunks.map((c) => c.tool)).toEqual(['tar', 'grep'])
  })
})

describe('parseBuiltins', () => {
  it('parses compgen -b output into builtin chunks', () => {
    const chunks = parseBuiltins('cd\nexport\nalias\nunset')
    expect(chunks.length).toBe(4)
    expect(chunks[0]!.tool).toBe('cd')
    expect(chunks.every((c) => c.family === 'unix' && c.source === 'local-builtin')).toBe(true)
  })
})

describe('parseHelpOutput', () => {
  it('extracts an intent + command from a --help blob', () => {
    const help = `Usage: jq [OPTIONS] FILTER [FILES...]\n\njq is a tool for processing JSON inputs.\n\nOptions:\n  -c  compact output`
    const chunk = parseHelpOutput(help, 'jq')
    expect(chunk).not.toBeNull()
    expect(chunk!.tool).toBe('jq')
    expect(chunk!.command).toContain('jq')
    expect(chunk!.intent.length).toBeGreaterThan(0)
  })

  it('returns null for empty help', () => {
    expect(parseHelpOutput('', 'foo')).toBeNull()
  })
})

describe('parseGetCommand (Windows)', () => {
  it('parses Get-Command output into powershell chunks', () => {
    const OUT = `CommandType     Name                  Version    Source
-----------     ----                  -------    ------
Cmdlet          Get-ChildItem         7.0.0.0    Microsoft.PowerShell
Cmdlet          Remove-Item           7.0.0.0    Microsoft.PowerShell`
    const chunks = parseGetCommand(OUT)
    expect(chunks.length).toBe(2)
    expect(chunks[0]!.tool).toBe('Get-ChildItem')
    expect(chunks.every((c) => c.family === 'powershell')).toBe(true)
  })
})

describe('filterToEnvironment', () => {
  const corpus: CommandChunk[] = [
    {
      id: 'tar-x',
      intent: 'extract',
      command: 'tar -xzf',
      family: 'unix',
      tool: 'tar',
      flags_explained: '',
      danger: false,
      source: 'tldr',
    },
    {
      id: 'ghost-x',
      intent: 'do',
      command: 'ghosttool run',
      family: 'unix',
      tool: 'ghosttool',
      flags_explained: '',
      danger: false,
      source: 'tldr',
    },
    {
      id: 'agf-next',
      intent: 'next task',
      command: 'agf next',
      family: 'harness',
      tool: 'agf next',
      flags_explained: '',
      danger: false,
      source: 'harness',
    },
  ]

  it('keeps only commands whose tool exists locally, but always keeps harness', () => {
    const filtered = filterToEnvironment(corpus, new Set(['tar']))
    const tools = filtered.map((c) => c.tool)
    expect(tools).toContain('tar')
    expect(tools).toContain('agf next') // harness always kept
    expect(tools).not.toContain('ghosttool') // not in environment → dropped
  })
})

describe('extractLocalCorpus (injected runner)', () => {
  const fakeRunner: LocalRunner = (cmd, args) => {
    if (cmd === 'apropos') return 'tar (1) - archiving utility\ngrep (1) - pattern search'
    if (cmd === 'bash' && args.join(' ').includes('compgen -b')) return 'cd\nexport'
    return null
  }

  it('builds a corpus from local sources only (environment-honest by construction)', () => {
    const corpus = extractLocalCorpus(fakeRunner)
    const tools = new Set(corpus.map((c) => c.tool))
    expect(tools.has('tar')).toBe(true)
    expect(tools.has('cd')).toBe(true)
    expect(corpus.every((c) => c.command.trim().length > 0)).toBe(true)
  })

  it('degrades gracefully when a source is unavailable (runner returns null)', () => {
    const corpus = extractLocalCorpus(() => null, { platform: 'linux' })
    expect(corpus).toEqual([])
  })
})

describe('extractLocalCorpus on Windows', () => {
  const getCmdOut = `CommandType     Name                  Version    Source
-----------     ----                  -------    ------
Cmdlet          Get-ChildItem         7.0.0.0    Microsoft.PowerShell
Cmdlet          Remove-Item           7.0.0.0    Microsoft.PowerShell
Function        Get-Foo               1.0.0      MyModule`

  it('harvests Get-Command (pwsh/powershell) instead of apropos/compgen', () => {
    const calls: string[] = []
    const winRunner: LocalRunner = (cmd) => {
      calls.push(cmd)
      if (cmd === 'pwsh' || cmd === 'powershell') return getCmdOut
      return null
    }
    const corpus = extractLocalCorpus(winRunner, { platform: 'win32' })
    expect(corpus.some((c) => c.tool === 'Get-ChildItem')).toBe(true)
    expect(corpus.every((c) => c.family === 'powershell')).toBe(true)
    // never tries the unix tools on Windows
    expect(calls).not.toContain('apropos')
    expect(calls).not.toContain('bash')
  })

  it('falls back from pwsh to powershell when pwsh is absent', () => {
    const winRunner: LocalRunner = (cmd) => (cmd === 'powershell' ? getCmdOut : null)
    const corpus = extractLocalCorpus(winRunner, { platform: 'win32' })
    expect(corpus.length).toBeGreaterThan(0)
  })

  it('returns [] on Windows with neither pwsh nor powershell', () => {
    expect(extractLocalCorpus(() => null, { platform: 'win32' })).toEqual([])
  })
})

describe('mergeLocalCorpus (footgun guard)', () => {
  const base: CommandChunk[] = [
    {
      id: 'tar-x',
      intent: 'extract',
      command: 'tar -xzf',
      family: 'unix',
      tool: 'tar',
      flags_explained: '',
      danger: false,
      source: 'builtin',
    },
    {
      id: 'agf-next',
      intent: 'next',
      command: 'agf next',
      family: 'harness',
      tool: 'agf next',
      flags_explained: '',
      danger: false,
      source: 'harness',
    },
  ]

  it('returns the base UNCHANGED when local extraction is empty (no stripping)', () => {
    const merged = mergeLocalCorpus(base, [])
    expect(merged).toEqual(base)
  })

  it('filters the seed to the environment and appends local chunks when non-empty', () => {
    const local: CommandChunk[] = [
      {
        id: 'gci',
        intent: 'list',
        command: 'Get-ChildItem',
        family: 'powershell',
        tool: 'Get-ChildItem',
        flags_explained: '',
        danger: false,
        source: 'local-pwsh',
      },
    ]
    const merged = mergeLocalCorpus(base, local)
    // seed 'tar' not in {Get-ChildItem} → dropped; harness kept; local appended
    expect(merged.some((c) => c.tool === 'tar')).toBe(false)
    expect(merged.some((c) => c.tool === 'agf next')).toBe(true)
    expect(merged.some((c) => c.tool === 'Get-ChildItem')).toBe(true)
  })
})
