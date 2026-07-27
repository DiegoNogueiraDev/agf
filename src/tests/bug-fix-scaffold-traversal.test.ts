/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bug fix — node_10d300122a04: `agf scaffold <name> --type … --apply` wrote to
 * `resolve(scaffoldDir, `${name}.ts`)` with an unsanitized name, so `../../evil`
 * escaped src/. resolveSafeScaffoldPath rejects any name that leaves scaffoldDir.
 */
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { resolveSafeScaffoldPath } from '../cli/commands/scaffold-cmd.js'

const scaffoldDir = resolve('/tmp/proj/src')

describe('node_10d300122a04 — scaffold path traversal', () => {
  it('rejects parent-dir traversal (../)', () => {
    expect(resolveSafeScaffoldPath(scaffoldDir, '../../../etc/evil')).toBeNull()
    expect(resolveSafeScaffoldPath(scaffoldDir, '../sibling')).toBeNull()
  })

  it('rejects an absolute path name', () => {
    expect(resolveSafeScaffoldPath(scaffoldDir, '/etc/passwd')).toBeNull()
  })

  it('rejects an empty name (would write scaffoldDir.ts sibling escape)', () => {
    expect(resolveSafeScaffoldPath(scaffoldDir, '')).toBeNull()
  })

  it('accepts a simple identifier and keeps it inside scaffoldDir', () => {
    const p = resolveSafeScaffoldPath(scaffoldDir, 'MyClass')
    expect(p).toBe(resolve(scaffoldDir, 'MyClass.ts'))
  })

  it('accepts a benign subdirectory name (stays inside src/)', () => {
    const p = resolveSafeScaffoldPath(scaffoldDir, 'feature/Widget')
    expect(p).toBe(resolve(scaffoldDir, 'feature/Widget.ts'))
    expect(p?.startsWith(scaffoldDir)).toBe(true)
  })
})
