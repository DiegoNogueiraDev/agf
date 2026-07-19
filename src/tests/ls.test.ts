import { describe, it, expect } from 'vitest'
import { ls } from '../core/tool-compress/filters/ls.js'

const LS_HEADER = 'total 24'

function makeLsLine(perm: string, size: number, name: string): string {
  return `${perm} 1 user group ${size} Jan 15 12:00 ${name}`
}

describe('ls — passthrough', () => {
  it('returns input when no parseable lines', () => {
    const input = 'nothing here\njust text'
    expect(ls(input)).toBe(input)
  })

  it('returns input for empty string', () => {
    expect(ls('')).toBe('')
  })
})

describe('ls — directories', () => {
  it('lists directory names with trailing slash', () => {
    const input = [LS_HEADER, makeLsLine('drwxr-xr-x', 0, 'src')].join('\n')
    expect(ls(input)).toContain('src/')
  })

  it('skips . and .. entries', () => {
    const input = [LS_HEADER, makeLsLine('drwxr-xr-x', 0, '.'), makeLsLine('drwxr-xr-x', 0, '..')].join('\n')
    const result = ls(input)
    expect(result).not.toContain('./\n')
    expect(result).not.toContain('../\n')
  })

  it('filters noise directories (node_modules) — not shown as dir entry', () => {
    const input = [LS_HEADER, makeLsLine('drwxr-xr-x', 0, 'src'), makeLsLine('drwxr-xr-x', 0, 'node_modules')].join(
      '\n',
    )
    const result = ls(input)
    expect(result).toContain('src/')
    expect(result).not.toContain('node_modules/')
  })
})

describe('ls — files', () => {
  it('shows file name with human-readable size in bytes', () => {
    const input = [LS_HEADER, makeLsLine('-rw-r--r--', 500, 'README.md')].join('\n')
    expect(ls(input)).toContain('README.md')
    expect(ls(input)).toContain('500B')
  })

  it('shows KB for files ≥ 1024 bytes', () => {
    const input = [LS_HEADER, makeLsLine('-rw-r--r--', 2048, 'large.ts')].join('\n')
    expect(ls(input)).toContain('2.0K')
  })

  it('shows MB for files ≥ 1MB', () => {
    const input = [LS_HEADER, makeLsLine('-rw-r--r--', 2097152, 'big.bin')].join('\n')
    expect(ls(input)).toContain('2.0M')
  })
})

describe('ls — summary', () => {
  it('includes file and dir count in summary', () => {
    const input = [LS_HEADER, makeLsLine('drwxr-xr-x', 0, 'src'), makeLsLine('-rw-r--r--', 100, 'index.ts')].join('\n')
    const result = ls(input)
    expect(result).toContain('1 files, 1 dirs')
  })

  it('includes extension summary', () => {
    const input = [LS_HEADER, makeLsLine('-rw-r--r--', 100, 'a.ts'), makeLsLine('-rw-r--r--', 100, 'b.ts')].join('\n')
    expect(ls(input)).toContain('.ts')
  })

  it('handles symlinks (l prefix)', () => {
    const input = [LS_HEADER, makeLsLine('lrwxrwxrwx', 10, 'link.ts')].join('\n')
    expect(ls(input)).toContain('link.ts')
  })
})

describe('ls — filterName', () => {
  it('has filterName "ls"', () => {
    expect(ls.filterName).toBe('ls')
  })
})
