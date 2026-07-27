/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_3e8e8777d5ce — detect multiple public classes in concatenated
 * .java. Java allows only 1 public type per file — concatenating two .java
 * files for joint compilation broke twice with cryptic javac errors.
 * countPublicTypes is a deterministic pre-compile check: catches this
 * before javac ever runs.
 */

import { describe, it, expect } from 'vitest'
import { countPublicTypes } from '../core/harness/java-validate.js'

describe('countPublicTypes', () => {
  it('returns 1 for a single public class (valid)', () => {
    const result = countPublicTypes('public class Foo {\n  void bar() {}\n}\n')
    expect(result.count).toBe(1)
    expect(result.valid).toBe(true)
  })

  it('returns 2 and raises an error for two public classes in one file', () => {
    const source = 'public class Foo {}\n\npublic class Bar {}\n'
    const result = countPublicTypes(source)
    expect(result.count).toBe(2)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Java allows only one public type per file')
  })

  it('returns 1 (valid) when only one type is public and the other is package-private', () => {
    const source = 'public class Foo {}\n\nclass Bar {}\n'
    const result = countPublicTypes(source)
    expect(result.count).toBe(1)
    expect(result.valid).toBe(true)
  })

  it('recognizes public interface/enum/record declarations too', () => {
    expect(countPublicTypes('public interface Foo {}\n').count).toBe(1)
    expect(countPublicTypes('public enum Foo {}\n').count).toBe(1)
    expect(countPublicTypes('public record Foo() {}\n').count).toBe(1)
    expect(countPublicTypes('public final class Foo {}\n').count).toBe(1)
  })
})
