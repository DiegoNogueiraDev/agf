/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { gitDiff } from '../core/tool-compress/filters/gitDiff.js'
import { gitStatus } from '../core/tool-compress/filters/gitStatus.js'
import { grep } from '../core/tool-compress/filters/grep.js'
import { find } from '../core/tool-compress/filters/find.js'
import { ls } from '../core/tool-compress/filters/ls.js'
import { tree } from '../core/tool-compress/filters/tree.js'

describe('gitDiff', () => {
  const diff = `diff --git a/src/a.ts b/src/a.ts
index abc..def 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 const x = 1
+const y = 2
 const z = 3
-const old = "old"
+const old = "new"`

  it('preserves file header and changes', () => {
    const out = gitDiff(diff)
    expect(out).toContain('src/a.ts')
    expect(out).toContain('+2 -1')
  })

  it('truncates long hunks beyond limit', () => {
    const lines: string[] = ['diff --git a/f.ts b/f.ts', '--- a/f.ts', '+++ b/f.ts', '@@ -1,200 +1,200 @@']
    for (let i = 1; i <= 200; i++) {
      lines.push(i % 2 === 0 ? `+line ${i}` : `-line ${i}`)
    }
    const out = gitDiff(lines.join('\n'))
    expect(out).toContain('truncated')
  })

  it('adds summary stats per file', () => {
    const out = gitDiff(diff)
    expect(out).toMatch(/\+2 -1/)
  })
})

describe('gitStatus', () => {
  it('parses porcelain status', () => {
    const input = '## main\nM  src/a.ts\n?? src/new.ts'
    const out = gitStatus(input)
    expect(out).toContain('Staged')
    expect(out).toContain('src/a.ts')
    expect(out).toContain('Untracked')
    expect(out).toContain('src/new.ts')
  })

  it('parses long-form status', () => {
    const input = 'On branch main\nmodified:   src/a.ts\nnew file:   src/b.ts'
    const out = gitStatus(input)
    expect(out).toContain('Modified')
    expect(out).toContain('src/a.ts')
    expect(out).toContain('Staged')
    expect(out).toContain('src/b.ts')
  })

  it('shows clean working tree', () => {
    expect(gitStatus('')).toContain('Clean')
  })

  it('caps file lists per STATUS_MAX_FILES', () => {
    const lines = ['## main']
    for (let i = 0; i < 20; i++) lines.push(`M  src/file${i}.ts`)
    const out = gitStatus(lines.join('\n'))
    expect(out).toContain('more')
  })

  it('handles conflicts', () => {
    const input = 'UU conflicted.ts'
    const out = gitStatus(input)
    expect(out).toContain('conflicts')
  })
})

describe('grep', () => {
  it('groups matches by file with line counts', () => {
    const input = 'src/a.ts:10:const x = 1\nsrc/a.ts:20:const y = 2\nsrc/b.ts:5:const z = 3'
    const out = grep(input)
    expect(out).toContain('3 matches')
    expect(out).toContain('[file] src/a.ts')
    expect(out).toContain('[file] src/b.ts')
    expect(out).toContain('   10: const x = 1')
  })

  it('passes through non-grep format', () => {
    expect(grep('hello world')).toBe('hello world')
  })

  it('caps per file at GREP_PER_FILE_MAX', () => {
    const lines: string[] = []
    for (let i = 0; i < 20; i++) lines.push(`src/a.ts:${i}:line ${i}`)
    const out = grep(lines.join('\n'))
    expect(out).toContain('+')
  })

  it('sorts files alphabetically', () => {
    const input = 'src/z.ts:1:a\nsrc/a.ts:1:b'
    const out = grep(input)
    const aIdx = out.indexOf('[file] src/a.ts')
    const zIdx = out.indexOf('[file] src/z.ts')
    expect(aIdx).toBeLessThan(zIdx)
  })
})

describe('find', () => {
  it('groups by directory with counts', () => {
    const input = 'src/a.ts\nsrc/b.ts\nlib/c.ts'
    const out = find(input)
    expect(out).toContain('3 files')
    expect(out).toContain('src/')
    expect(out).toContain('lib/')
  })

  it('passes through for empty input', () => {
    expect(find('')).toBe('')
  })

  it('caps per dir and total dirs', () => {
    const lines: string[] = []
    for (let d = 0; d < 30; d++) {
      for (let f = 0; f < 20; f++) lines.push(`dir${d}/file${f}.ts`)
    }
    const out = find(lines.join('\n'))
    expect(out).toContain('dir0')
    expect(out).toContain('more dirs')
  })
})

describe('ls', () => {
  const lsOutput = [
    'total 42',
    '-rw-r--r--  1 user  staff  1024 Jun  1 12:00 a.ts',
    '-rw-r--r--  1 user  staff  2048 Jun  1 12:00 b.ts',
    'drwxr-xr-x  2 user  staff    64 Jun  1 12:00 src',
    '-rw-r--r--  1 user  staff  5000 Jun  1 12:00 main.ts',
  ].join('\n')

  it('lists files with human sizes', () => {
    const out = ls(lsOutput)
    expect(out).toContain('a.ts')
    expect(out).toContain('1.0K')
    expect(out).toContain('src/')
  })

  it('includes summary line', () => {
    const out = ls(lsOutput)
    expect(out).toContain('Summary')
    expect(out).toContain('files')
    expect(out).toContain('dirs')
  })

  it('filters noise directories', () => {
    const noise = [
      'total 0',
      'drwxr-xr-x  2 user  staff  64 Jun  1 12:00 node_modules',
      'drwxr-xr-x  2 user  staff  64 Jun  1 12:00 .git',
      '-rw-r--r--  1 user  staff  100 Jun  1 12:00 a.ts',
    ].join('\n')
    const out = ls(noise)
    expect(out).not.toContain('node_modules')
    expect(out).toContain('a.ts')
  })

  it('returns original if no ls lines parsed', () => {
    expect(ls('random text')).toBe('random text')
  })
})

describe('tree', () => {
  const treeOutput = `.
├── src
│   ├── a.ts
│   └── b.ts
├── package.json
└── README.md

2 directories, 4 files`

  it('removes summary line and trailing blank', () => {
    const out = tree(treeOutput)
    expect(out).not.toContain('directories')
    expect(out).toContain('src')
    expect(out).toContain('a.ts')
  })

  it('returns original for empty input', () => {
    expect(tree('')).toBe('')
  })

  it('truncates deep trees beyond TREE_MAX_LINES', () => {
    const lines: string[] = ['.']
    for (let i = 0; i < 300; i++) lines.push(`├── file${i}.ts`)
    const out = tree(lines.join('\n'))
    expect(out).toContain('more lines')
  })
})
