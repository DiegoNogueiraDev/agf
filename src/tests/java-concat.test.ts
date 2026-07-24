/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_10880cdf6394 — reorder imports on Java source concatenation.
 * When two .java files are pasted back-to-back for joint compilation,
 * imports from the second file land after the first file's class
 * declaration — invalid Java syntax. concatJavaSources hoists all
 * import/package statements to the top (deduplicated), then concatenates
 * the remaining class/method bodies below.
 */

import { describe, it, expect } from 'vitest'
import { concatJavaSources } from '../core/harness/java-concat.js'

describe('concatJavaSources', () => {
  it('hoists all imports (deduplicated) to the top, followed by both class bodies', () => {
    const fileA = 'import java.util.List;\nimport java.util.Map;\n\npublic class Foo {\n  void a() {}\n}\n'
    const fileB = 'import java.util.Set;\nimport java.io.IOException;\n\nclass Bar {\n  void b() {}\n}\n'

    const result = concatJavaSources([fileA, fileB])
    const lines = result.split('\n')
    const importLines = lines.filter((l) => l.startsWith('import '))

    expect(importLines).toEqual([
      'import java.util.List;',
      'import java.util.Map;',
      'import java.util.Set;',
      'import java.io.IOException;',
    ])
    expect(result).toContain('public class Foo {')
    expect(result).toContain('class Bar {')
    // All imports appear before either class body.
    const lastImportIndex = result.lastIndexOf('import java.io.IOException;')
    const fooIndex = result.indexOf('public class Foo {')
    const barIndex = result.indexOf('class Bar {')
    expect(lastImportIndex).toBeLessThan(fooIndex)
    expect(lastImportIndex).toBeLessThan(barIndex)
  })

  it('deduplicates a repeated import across files', () => {
    const fileA = 'import java.util.List;\n\npublic class Foo {}\n'
    const fileB = 'import java.util.List;\n\nclass Bar {}\n'

    const result = concatJavaSources([fileA, fileB])
    const occurrences = result.split('import java.util.List;').length - 1
    expect(occurrences).toBe(1)
  })

  it('produces only the class body when a file has no imports (no empty import block)', () => {
    const fileA = 'public class Foo {\n  void a() {}\n}\n'

    const result = concatJavaSources([fileA])
    expect(result.trim().startsWith('public class Foo {')).toBe(true)
  })

  it('hoists package statements too, alongside imports', () => {
    const fileA = 'package com.example.a;\nimport java.util.List;\n\npublic class Foo {}\n'
    const fileB = 'package com.example.b;\n\nclass Bar {}\n'

    const result = concatJavaSources([fileA, fileB])
    expect(result).toContain('package com.example.a;')
    expect(result).toContain('package com.example.b;')
    const fooIndex = result.indexOf('public class Foo {')
    const lastPackageIndex = result.lastIndexOf('package com.example.b;')
    expect(lastPackageIndex).toBeLessThan(fooIndex)
  })
})
