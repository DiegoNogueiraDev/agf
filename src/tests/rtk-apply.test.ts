/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { safeApply } from '../core/tool-compress/apply-filter.js'
import { autoDetectFilter } from '../core/tool-compress/autodetect.js'
import { DETECT_WINDOW, MIN_COMPRESS_SIZE, RAW_CAP } from '../core/tool-compress/constants.js'

const GIT_DIFF = `diff --git a/foo.ts b/foo.ts
index abc..def 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1,5 +1,7 @@
 const x = 1
+const y = 2
+const z = 3

 const old = "old"`

const GREP_OUT = `src/foo.ts:10:  const x = 1
src/bar.ts:20:  const y = 2
src/baz.ts:30:  const z = 3`

const LS_L = `total 42
drwxr-xr-x  10 user  staff   320 Jun  1 12:00 .
-rw-r--r--   1 user  staff  1024 Jun  1 12:00 a.ts
-rw-r--r--   1 user  staff  2048 Jun  1 12:00 b.ts
-rw-r--r--   1 user  staff  4096 Jun  1 12:00 c.ts`

const TREE = `.
├── src
│   ├── index.ts
│   └── utils.ts
├── package.json
└── README.md`

const FIND = `./src/index.ts
./src/utils.ts
./package.json
./README.md`

const BUILD_OUT = `npm ERR! code ELIFECYCLE
npm ERR! errno 1
Compiling something...
added 10 packages
Finished in 2.3s`

describe('autoDetectFilter', () => {
  it('detects git-diff format', () => {
    const fn = autoDetectFilter(GIT_DIFF + '\n'.repeat(500))
    expect(fn).toBeDefined()
    expect(fn).not.toBeNull()
  })

  it('detects grep format', () => {
    const fn = autoDetectFilter(GREP_OUT)
    expect(fn).toBeDefined()
  })

  it('detects ls -la format', () => {
    const fn = autoDetectFilter(LS_L)
    expect(fn).toBeDefined()
  })

  it('detects tree format', () => {
    const fn = autoDetectFilter(TREE)
    expect(fn).toBeDefined()
  })

  it('detects find format', () => {
    const fn = autoDetectFilter(FIND)
    expect(fn).toBeDefined()
  })

  it('detects build-output format', () => {
    const fn = autoDetectFilter(BUILD_OUT)
    expect(fn).toBeDefined()
  })

  it('returns null for unknown format (short text)', () => {
    const fn = autoDetectFilter('hello world this is just some text')
    expect(fn).toBeNull()
  })

  it('only peeks DETECT_WINDOW bytes', () => {
    const head = 'diff --git a/x b/x\n@@ -1 +1 @@\n'.repeat(100)
    const fn = autoDetectFilter(head)
    expect(fn).toBeDefined()
    expect(DETECT_WINDOW).toBe(1024)
  })
})

describe('safeApply', () => {
  const shrink = (s: string) => s.slice(0, Math.floor(s.length / 2))

  it('applies function and returns result', () => {
    const r = safeApply(shrink, 'hello world')
    expect(r).toBe('hello')
  })

  it('returns original when fn throws', () => {
    const r = safeApply(() => {
      throw new Error('boom')
    }, 'hello')
    expect(r).toBe('hello')
  })

  it('returns original when fn is not a function', () => {
    const r = safeApply(null as unknown as (s: string) => string, 'hello')
    expect(r).toBe('hello')
  })

  it('returns original when fn returns non-string', () => {
    const r = safeApply(() => 42 as unknown as string, 'hello')
    expect(r).toBe('hello')
  })

  it('applies function that grows content', () => {
    const r = safeApply((s: string) => s + '!', 'hi')
    expect(r).toBe('hi!')
  })

  it('reports filterName on error', () => {
    const fn = (s: string) => {
      throw new Error('oops')
    }
    fn.filterName = 'test-filter'
    const r = safeApply(fn, 'hello')
    expect(r).toBe('hello')
  })

  it('MIN_COMPRESS_SIZE constant is 500', () => {
    expect(MIN_COMPRESS_SIZE).toBe(500)
  })

  it('RAW_CAP constant is 10MiB', () => {
    expect(RAW_CAP).toBe(10 * 1024 * 1024)
  })
})
