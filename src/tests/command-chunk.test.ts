import { describe, it, expect } from 'vitest'
import { isDangerous } from '../core/rag-in/command-chunk.js'
import type { CommandChunk, CommandFamily } from '../core/rag-in/command-chunk.js'

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
