import { describe, it, expect } from 'vitest'
import { chunkHarnessCommands, isDangerous } from '../core/rag-in/command-chunk.js'
import { buildHarnessCorpus } from '../core/rag-in/builtin-corpus.js'
import type { CommandChunk, CommandFamily } from '../core/rag-in/command-chunk.js'

/** `agf node node show` — a group name spoken twice. Nothing runs. */
function repeatsAToken(command: string): boolean {
  const tokens = command.split(/\s+/)
  return tokens.some((t, i) => i > 1 && t === tokens[i - 1])
}

describe('chunkHarnessCommands — the command it emits has to be one you can run', () => {
  // COMMAND_REGISTRY carries two conventions at once. Most parented entries name
  // themselves bare (`name: 'show', parent: 'node'`), but twenty-five spell the group
  // into the name as well (`name: 'node show', parent: 'node'`). Concatenating both
  // produced `agf node node show`, and RAG-IN — the surface whose whole job is to hand
  // an agent the exact command — handed back one that does not exist, for ninety of the
  // hundred and sixty-eight commands it knows.
  it('does not repeat the parent when the name already carries it', () => {
    const chunks = chunkHarnessCommands([{ name: 'node show', parent: 'node', description: 'show a node' }])
    expect(chunks[0]?.command).toBe('agf node show')
  })

  it('still qualifies a bare subcommand name with its parent', () => {
    const chunks = chunkHarnessCommands([{ name: 'show', parent: 'node', description: 'show a node' }])
    expect(chunks[0]?.command).toBe('agf node show')
  })

  it('leaves a top-level command alone', () => {
    const chunks = chunkHarnessCommands([{ name: 'next', description: 'pull the next task' }])
    expect(chunks[0]?.command).toBe('agf next')
  })

  it('emits no runnable-looking command that repeats a token, across the whole corpus', () => {
    const offenders = buildHarnessCorpus()
      .map((c) => c.command)
      .filter(repeatsAToken)
    expect(offenders).toEqual([])
  })
})

describe('isDangerous', () => {
  it('flags rm -rf as dangerous', () => {
    expect(isDangerous('rm -rf /tmp/data')).toBe(true)
  })

  it('flags rm -fr variant', () => {
    expect(isDangerous('rm -fr .')).toBe(true)
  })

  it('flags dd if= as dangerous', () => {
    expect(isDangerous('dd if=/dev/zero of=/dev/sda')).toBe(true)
  })

  it('flags mkfs as dangerous', () => {
    expect(isDangerous('mkfs.ext4 /dev/sdb1')).toBe(true)
  })

  it('flags Remove-Item with -Recurse as dangerous', () => {
    expect(isDangerous('Remove-Item C:\\temp -Recurse')).toBe(true)
  })

  it('flags Format-Volume as dangerous', () => {
    expect(isDangerous('Format-Volume -DriveLetter D')).toBe(true)
  })

  it('does not flag safe commands', () => {
    expect(isDangerous('ls -la')).toBe(false)
    expect(isDangerous('cat file.txt')).toBe(false)
    expect(isDangerous('npm install')).toBe(false)
  })

  it('does not flag plain rm without -r/-f', () => {
    expect(isDangerous('rm file.txt')).toBe(false)
  })
})

describe('CommandChunk type', () => {
  it('constructs a valid command chunk', () => {
    const chunk: CommandChunk = {
      id: 'tar-extract-gzip',
      intent: 'Extract a gzipped archive',
      command: 'tar -xzf {file}',
      family: 'unix' as CommandFamily,
      tool: 'tar',
      flags_explained: '-x extract, -z gzip, -f file',
      danger: false,
      source: 'tldr',
    }
    expect(chunk.danger).toBe(false)
    expect(chunk.family).toBe('unix')
  })
})
