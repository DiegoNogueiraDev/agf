/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Contract for scripts/push-range-files.mjs — the range/filter decisions
 * behind the pre-push blast gate (node_984daec4f1ca). Locks: the gate reads
 * the COMMITTED range being pushed (never the dirty/untracked working tree),
 * and only relates .ts/.tsx files that still exist on disk.
 */

import { describe, it, expect } from 'vitest'

import { resolvePushDiffRange, parseDiffOutput, filterToExistingTsFiles } from '../../scripts/push-range-files.mjs'

describe('resolvePushDiffRange', () => {
  it('diffs against @{push} when the branch has a push destination', () => {
    expect(resolvePushDiffRange(true)).toBe('@{push}..HEAD')
  })

  it('falls back to origin/main..HEAD when there is no upstream yet', () => {
    expect(resolvePushDiffRange(false)).toBe('origin/main..HEAD')
  })
})

describe('parseDiffOutput', () => {
  it('splits diff --name-only output into a path list', () => {
    expect(parseDiffOutput('src/a.ts\nsrc/b.ts\n')).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('returns an empty list for an empty range (nothing to push)', () => {
    expect(parseDiffOutput('')).toEqual([])
    expect(parseDiffOutput('\n')).toEqual([])
  })

  it('drops blank lines between entries', () => {
    expect(parseDiffOutput('src/a.ts\n\nsrc/b.ts\n')).toEqual(['src/a.ts', 'src/b.ts'])
  })
})

describe('filterToExistingTsFiles', () => {
  it('keeps only .ts/.tsx paths that exist on disk', () => {
    const exists = new Set(['src/a.ts', 'src/b.tsx'])
    const result = filterToExistingTsFiles(['src/a.ts', 'src/b.tsx', 'src/deleted.ts', 'README.md'], (p) =>
      exists.has(p),
    )
    expect(result).toEqual(['src/a.ts', 'src/b.tsx'])
  })

  it('never lets an untracked working-tree file leak in — it is simply not in the input list', () => {
    // The gate's input list comes from `git diff --name-only <committed range>`,
    // which never includes untracked files by construction — this test locks
    // that filterToExistingTsFiles adds no path back in, only removes.
    const input = ['src/a.ts']
    const result = filterToExistingTsFiles(input, () => true)
    expect(result).toEqual(['src/a.ts'])
    expect(result.length).toBeLessThanOrEqual(input.length)
  })

  it('returns an empty list when the range touched no .ts files', () => {
    expect(filterToExistingTsFiles(['README.md', 'package.json'], () => true)).toEqual([])
  })
})
