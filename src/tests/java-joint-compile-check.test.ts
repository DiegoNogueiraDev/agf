/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_wire_c7f349d257ee — wire concatJavaSources (java-concat.ts) to a
 * surface. checkJavaJointCompilation concatenates every .java file under a
 * directory the way agf would for joint compilation, then validates the
 * result has at most one public top-level type before javac ever runs.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkJavaJointCompilation } from '../core/harness/java-joint-compile-check.js'

describe('checkJavaJointCompilation', () => {
  const dirs: string[] = []

  function makeDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'agf-java-joint-'))
    dirs.push(dir)
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content)
    }
    return dir
  }

  afterEach(() => {
    while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true })
  })

  it('concatenates every .java file under dir and reports 1 public type as valid', () => {
    const dir = makeDir({
      'Foo.java': 'import java.util.List;\n\npublic class Foo {\n  void a() {}\n}\n',
      'Bar.java': 'import java.util.Set;\n\nclass Bar {\n  void b() {}\n}\n',
    })

    const result = checkJavaJointCompilation(dir)

    expect(result.files.sort()).toEqual(['Bar.java', 'Foo.java'])
    expect(result.concatenated).toContain('public class Foo {')
    expect(result.concatenated).toContain('class Bar {')
    expect(result.publicTypes.valid).toBe(true)
    expect(result.publicTypes.count).toBe(1)
  })

  it('flags joint compilation as invalid when two files each declare a public type', () => {
    const dir = makeDir({
      'Foo.java': 'public class Foo {}\n',
      'Bar.java': 'public class Bar {}\n',
    })

    const result = checkJavaJointCompilation(dir)

    expect(result.publicTypes.valid).toBe(false)
    expect(result.publicTypes.count).toBe(2)
    expect(result.publicTypes.error).toContain('Java allows only one public type per file')
  })

  it('ignores non-.java files and ignores empty directories', () => {
    const dir = makeDir({ 'Foo.java': 'public class Foo {}\n', 'notes.md': '# not java\n' })

    const result = checkJavaJointCompilation(dir)

    expect(result.files).toEqual(['Foo.java'])
    expect(result.publicTypes.valid).toBe(true)
  })
})
