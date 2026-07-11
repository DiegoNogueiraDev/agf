import { describe, it, expect } from 'vitest'
import {
  isDangerous,
  chunkTldrPage,
  chunkTldrBatch,
  chunkManPage,
  chunkPowerShellHelp,
  chunkHarnessCommands,
  type CommandChunk,
} from '../core/rag-in/command-chunk.js'

const TLDR_TAR = `# tar

> Archiving utility, often combined with a compression method.
> More information: <https://www.gnu.org/software/tar>.

- Extract a gzipped archive to the current directory:

\`tar -xzf {{path/to/file.tar.gz}}\`

- Create a gzipped archive:

\`tar -czf {{target.tar.gz}} {{file1 file2}}\`

- List the contents of a tar file without extracting:

\`tar -tf {{path/to/file.tar}}\`
`

const TLDR_RM = `# rm

> Remove files or directories.

- Recursively remove a directory and its contents (DANGEROUS):

\`rm -rf {{path/to/directory}}\`
`

describe('isDangerous', () => {
  it('flags destructive unix commands', () => {
    expect(isDangerous('rm -rf /tmp/x')).toBe(true)
    expect(isDangerous('dd if=/dev/zero of=/dev/sda')).toBe(true)
    expect(isDangerous('mkfs.ext4 /dev/sdb')).toBe(true)
  })
  it('flags destructive PowerShell commands', () => {
    expect(isDangerous('Remove-Item -Recurse -Force C:\\data')).toBe(true)
  })
  it('does not flag safe commands', () => {
    expect(isDangerous('tar -xzf file.tar.gz')).toBe(false)
    expect(isDangerous('ls -la')).toBe(false)
  })
})

describe('chunkTldrPage', () => {
  it('produces one chunk per (intent, command) pair', () => {
    const chunks = chunkTldrPage(TLDR_TAR, { family: 'unix', source: 'tldr' })
    expect(chunks).toHaveLength(3)
  })

  it('extracts intent, command, tool and normalizes {{placeholder}} → {placeholder}', () => {
    const chunks = chunkTldrPage(TLDR_TAR, { family: 'unix', source: 'tldr' })
    const extract = chunks[0]!
    expect(extract.tool).toBe('tar')
    expect(extract.family).toBe('unix')
    expect(extract.source).toBe('tldr')
    expect(extract.intent.toLowerCase()).toContain('extract')
    expect(extract.command).toBe('tar -xzf {path/to/file.tar.gz}')
    expect(extract.danger).toBe(false)
    expect(extract.id.length).toBeGreaterThan(0)
  })

  it('never emits a chunk with an empty command', () => {
    const chunks = chunkTldrPage(TLDR_TAR, { family: 'unix' })
    expect(chunks.every((c: CommandChunk) => c.command.trim().length > 0)).toBe(true)
  })

  it('marks destructive commands as danger:true', () => {
    const chunks = chunkTldrPage(TLDR_RM, { family: 'unix' })
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.danger).toBe(true)
  })

  it('produces deterministic, unique ids', () => {
    const a = chunkTldrPage(TLDR_TAR, { family: 'unix' })
    const b = chunkTldrPage(TLDR_TAR, { family: 'unix' })
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length)
  })
})

describe('chunkPowerShellHelp', () => {
  const PS_HELP = `NAME
    Get-ChildItem

SYNOPSIS
    Gets the items and child items in one or more specified locations.

    -------------------------- Example 1 --------------------------

    Get the files in the current directory:

    PS C:\\> Get-ChildItem

    -------------------------- Example 2 --------------------------

    Get all files recursively:

    PS C:\\> Get-ChildItem -Recurse -File
`

  const PS_REMOVE = `NAME
    Remove-Item

SYNOPSIS
    Deletes files and folders.

    -------------------------- Example 1 --------------------------

    Delete a directory and all its contents (DANGEROUS):

    PS C:\\> Remove-Item -Recurse -Force C:\\Temp

    -------------------------- Example 2 --------------------------

    Delete a single file:

    PS C:\\> Remove-Item C:\\logs\\app.log
`

  it('produces a chunk per Get-Help example with family powershell', () => {
    const chunks = chunkPowerShellHelp(PS_HELP, { source: 'powershell-docs' })
    expect(chunks.length).toBe(2)
    expect(chunks.every((c) => c.family === 'powershell')).toBe(true)
    expect(chunks[0]!.tool).toBe('Get-ChildItem')
    expect(chunks[0]!.command).toContain('Get-ChildItem')
    expect(chunks.every((c) => c.command.trim().length > 0)).toBe(true)
  })

  it('associates description prose with the adjacent command', () => {
    const chunks = chunkPowerShellHelp(PS_HELP, { source: 'powershell-docs' })
    expect(chunks[0]!.intent.toLowerCase()).toContain('current directory')
  })

  it('marks Remove-Item -Recurse as danger:true', () => {
    const chunks = chunkPowerShellHelp(PS_REMOVE)
    const dangerChunk = chunks.find((c) => c.command.includes('Remove-Item -Recurse'))
    expect(dangerChunk).toBeDefined()
    expect(dangerChunk!.danger).toBe(true)
  })

  it('marks safe Remove-Item as danger:false', () => {
    const chunks = chunkPowerShellHelp(PS_REMOVE)
    const safeChunk = chunks.find((c) => c.command.includes('app.log'))
    expect(safeChunk).toBeDefined()
    expect(safeChunk!.danger).toBe(false)
  })

  it('uses powershell-docs as default source', () => {
    const chunks = chunkPowerShellHelp(PS_HELP)
    expect(chunks.every((c) => c.source === 'powershell-docs')).toBe(true)
  })

  it('returns empty array when no Example blocks found', () => {
    const noExamples = 'NAME\n    Get-Thing\n\nSYNOPSIS\n    Does something.\n'
    const chunks = chunkPowerShellHelp(noExamples)
    expect(chunks).toHaveLength(0)
  })

  it('produces deterministic, unique ids', () => {
    const a = chunkPowerShellHelp(PS_HELP)
    const b = chunkPowerShellHelp(PS_HELP)
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length)
  })
})

describe('chunkHarnessCommands (dogfooding 1.4)', () => {
  it('derives one harness chunk per registry entry, family harness', () => {
    const chunks = chunkHarnessCommands([
      { name: 'next', description: 'Puxa a próxima task desbloqueada' },
      { name: 'add', parent: 'node', description: 'Cria um nó no grafo' },
    ])
    expect(chunks).toHaveLength(2)
    expect(chunks.every((c) => c.family === 'harness')).toBe(true)
    expect(chunks[0]!.command).toBe('agf next')
    expect(chunks[1]!.command).toBe('agf node add')
    expect(chunks.every((c) => c.command.trim().length > 0)).toBe(true)
  })
})

// Real-world TLDR edge cases
const TLDR_REAL_TAR = `# tar

> [c]reate, e[x]tract or [l]ist files from a tar archive.
> Use \`brew install gnu-tar\` to use the features below on macOS.
> More information: <https://www.gnu.org/software/tar>.

- [c]reate an archive and write it to a [f]ile:

\`tar cf {{path/to/target.tar}} {{path/to/file}} {{path/to/directory}} ...\`

- [c]reate a g[z]ipped archive:

\`tar czf {{path/to/target.tar.gz}} {{path/to/file}} ...\`

- E[x]tract a (compressed) archive [f]ile into the current directory [v]erbosely:

\`tar xvf {{path/to/source.tar[.gz|.bz2|.xz]}}\`
`

const TLDR_WINDOWS_DEL = `# del

> Delete files on Windows.
> More information: <https://learn.microsoft.com/>.

- Delete a file:

\`del {{path/to/file}}\`
`

describe('chunkTldrPage — real-world edge cases', () => {
  it('handles bracket-notation intent text correctly', () => {
    const chunks = chunkTldrPage(TLDR_REAL_TAR, { family: 'unix' })
    expect(chunks.length).toBe(3)
    expect(chunks.every((c) => c.tool === 'tar')).toBe(true)
    expect(chunks.every((c) => c.command.length > 0)).toBe(true)
  })

  it('ignores multiple > description lines without emitting extra chunks', () => {
    const chunks = chunkTldrPage(TLDR_REAL_TAR, { family: 'unix' })
    // Exactly 3 examples in the fixture — no phantom chunks from description lines
    expect(chunks).toHaveLength(3)
  })

  it('passes explicit family through to all chunks', () => {
    const chunks = chunkTldrPage(TLDR_WINDOWS_DEL, { family: 'windows' })
    expect(chunks.every((c) => c.family === 'windows')).toBe(true)
  })

  it('returns empty array for a page with no command examples', () => {
    const noExamples = '# emptytool\n\n> A tool with no examples yet.\n'
    const chunks = chunkTldrPage(noExamples, { family: 'unix' })
    expect(chunks).toHaveLength(0)
  })
})

describe('chunkTldrBatch', () => {
  it('processes multiple pages and returns a flat chunk list', () => {
    const chunks = chunkTldrBatch([
      { markdown: TLDR_TAR, platform: 'linux' },
      { markdown: TLDR_RM, platform: 'linux' },
    ])
    // TLDR_TAR has 3 examples, TLDR_RM has 1
    expect(chunks).toHaveLength(4)
  })

  it('maps platform windows → family windows, others → family unix', () => {
    const chunks = chunkTldrBatch([
      { markdown: TLDR_WINDOWS_DEL, platform: 'windows' },
      { markdown: TLDR_TAR, platform: 'linux' },
    ])
    const delChunk = chunks.find((c) => c.tool === 'del')
    const tarChunk = chunks.find((c) => c.tool === 'tar')
    expect(delChunk?.family).toBe('windows')
    expect(tarChunk?.family).toBe('unix')
  })

  it('maps osx and common platforms → family unix', () => {
    const chunks = chunkTldrBatch([
      { markdown: TLDR_TAR, platform: 'osx' },
      { markdown: TLDR_TAR, platform: 'common' },
    ])
    expect(chunks.every((c) => c.family === 'unix')).toBe(true)
  })

  it('deduplicates ids across pages from different sources', () => {
    // Same page twice — ids must still be unique
    const chunks = chunkTldrBatch([
      { markdown: TLDR_TAR, platform: 'linux', source: 'tldr-a' },
      { markdown: TLDR_TAR, platform: 'linux', source: 'tldr-b' },
    ])
    const ids = chunks.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns empty array for empty input', () => {
    expect(chunkTldrBatch([])).toEqual([])
  })

  it('passes through source tag from each page entry', () => {
    const chunks = chunkTldrBatch([{ markdown: TLDR_TAR, source: 'custom-src' }])
    expect(chunks.every((c) => c.source === 'custom-src')).toBe(true)
  })
})

// Man page fixtures
// Style 1 (GNU/Linux): description prose → blank line → indented command
const MAN_TAR = `TAR(1)                           User Commands                          TAR(1)

NAME
       tar - an archiving utility

SYNOPSIS
       tar [OPTION...] [FILE]...

DESCRIPTION
       GNU tar is an archiving program designed to store multiple files in a
       single file (an archive), and to manipulate such archives.

EXAMPLES
       Create archive.tar from files foo and bar.

              tar -cf archive.tar foo bar

       Extract all files from archive.tar.

              tar -xf archive.tar

       Create a compressed archive, using gzip.

              tar -czf archive.tar.gz foo bar

BUGS
       Incremental archives only work correctly if files are not deleted.

HISTORY
       Originally written in 1979, this is very long history text.
`

// Style 2 (BSD/many tools): command line → indented description
const MAN_GREP = `GREP(1)

NAME
       grep - print lines that match patterns

SYNOPSIS
       grep [OPTION...] PATTERNS [FILE...]

EXAMPLES
       grep "hello" file.txt
              Searches for "hello" in file.txt.

       grep -r "pattern" /path/to/dir
              Searches recursively in a directory.

       grep -rn --include="*.ts" "TODO" .
              Search for TODO comments in TypeScript files.
`

// Man page with a destructive command in EXAMPLES
const MAN_DD = `DD(1)

NAME
       dd - convert and copy a file

SYNOPSIS
       dd [OPERAND]...

EXAMPLES
       Wipe the first block device.

              dd if=/dev/zero of=/dev/sda bs=512 count=1

       Copy disk image.

              dd if=/dev/sda of=disk.img bs=1M
`

describe('chunkManPage', () => {
  it('extracts SYNOPSIS as a chunk', () => {
    const chunks = chunkManPage(MAN_TAR, { source: 'local-man' })
    const syn = chunks.find((c) => c.intent.includes('synopsis') || c.command.includes('[OPTION'))
    expect(syn).toBeDefined()
    expect(syn!.source).toBe('local-man')
    expect(syn!.tool).toBe('tar')
  })

  it('extracts one chunk per EXAMPLES entry (style 1: desc before command)', () => {
    const chunks = chunkManPage(MAN_TAR)
    // 3 examples + 1 synopsis
    const exChunks = chunks.filter((c) => c.command.startsWith('tar -') && !c.command.includes('[OPTION'))
    expect(exChunks.length).toBe(3)
  })

  it('associates description prose with the adjacent command (style 1)', () => {
    const chunks = chunkManPage(MAN_TAR)
    const createChunk = chunks.find((c) => c.command === 'tar -cf archive.tar foo bar')
    expect(createChunk).toBeDefined()
    expect(createChunk!.intent.toLowerCase()).toContain('create')
  })

  it('extracts commands from style 2 man page (command before desc)', () => {
    const chunks = chunkManPage(MAN_GREP)
    // Exclude the SYNOPSIS chunk (its intent contains 'synopsis')
    const exChunks = chunks.filter((c) => c.command.startsWith('grep') && !c.intent.includes('synopsis'))
    expect(exChunks.length).toBe(3)
  })

  it('discards BUGS and HISTORY sections entirely', () => {
    const chunks = chunkManPage(MAN_TAR)
    const bugOrHistory = chunks.filter(
      (c) => c.intent.toLowerCase().includes('incremental') || c.intent.toLowerCase().includes('1979'),
    )
    expect(bugOrHistory).toHaveLength(0)
  })

  it('marks destructive commands as danger:true', () => {
    const chunks = chunkManPage(MAN_DD)
    const wipeChunk = chunks.find((c) => c.command.includes('/dev/zero'))
    expect(wipeChunk).toBeDefined()
    expect(wipeChunk!.danger).toBe(true)
  })

  it('marks safe commands as danger:false', () => {
    const chunks = chunkManPage(MAN_TAR)
    const safeChunk = chunks.find((c) => c.command === 'tar -xf archive.tar')
    expect(safeChunk).toBeDefined()
    expect(safeChunk!.danger).toBe(false)
  })

  it('uses local-man as default source', () => {
    const chunks = chunkManPage(MAN_TAR)
    expect(chunks.every((c) => c.source === 'local-man')).toBe(true)
  })

  it('returns empty array for man page with no recognized sections', () => {
    const chunks = chunkManPage('Some random text without any section headers\n')
    expect(chunks).toHaveLength(0)
  })

  it('produces deterministic, unique ids', () => {
    const a = chunkManPage(MAN_TAR)
    const b = chunkManPage(MAN_TAR)
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length)
  })
})
