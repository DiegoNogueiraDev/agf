/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { assertPathInside, PathTraversalError } from '../core/utils/safe-path.js'

describe('assertPathInside', () => {
  const root = '/tmp/safe-root'

  it('accepts a normal path inside root', () => {
    const result = assertPathInside('file.txt', root)
    expect(result).toBe('/tmp/safe-root/file.txt')
  })

  it('accepts a nested path inside root', () => {
    const result = assertPathInside('sub/dir/file.txt', root)
    expect(result).toBe('/tmp/safe-root/sub/dir/file.txt')
  })

  it('rejects path with .. traversal', () => {
    expect(() => assertPathInside('../etc/passwd', root)).toThrow(PathTraversalError)
  })

  it('rejects deeply nested traversal', () => {
    expect(() => assertPathInside('sub/../../etc/passwd', root)).toThrow(PathTraversalError)
  })

  it('rejects empty path', () => {
    expect(() => assertPathInside('', root)).toThrow(PathTraversalError)
  })

  it('rejects whitespace-only path', () => {
    expect(() => assertPathInside('   ', root)).toThrow(PathTraversalError)
  })

  it('rejects null byte in path', () => {
    expect(() => assertPathInside('file\0.txt', root)).toThrow(PathTraversalError)
  })

  it('rejects URL-encoded traversal (%2e%2e/)', () => {
    // %2e = '.'; %2f = '/'; so %2e%2e%2f = '../'
    expect(() => assertPathInside('%2e%2e%2fetc%2fpasswd', root)).toThrow(PathTraversalError)
  })

  it('rejects double-URL-encoded traversal (%252e%252e/)', () => {
    // %252e → %2e → '.'
    expect(() => assertPathInside('%252e%252e%252fetc', root)).toThrow(PathTraversalError)
  })

  it('rejects fullwidth unicode traversal (．．／)', () => {
    // U+FF0E U+FF0E U+FF0F = ．．／ = ../ traversal
    expect(() => assertPathInside('\uFF0E\uFF0E\uFF0Fetc', root)).toThrow(PathTraversalError)
  })

  it('rejects null byte after URL decoding', () => {
    // %00 = null byte
    expect(() => assertPathInside('file%00.txt', root)).toThrow(PathTraversalError)
  })

  it('rejects Windows-style backslash traversal', () => {
    expect(() => assertPathInside('..\\..\\windows\\system32', root)).toThrow(PathTraversalError)
  })

  it('rejects path that resolves outside via backslashes', () => {
    // Mixed separators
    expect(() => assertPathInside('sub\\..\\..\\etc', root)).toThrow(PathTraversalError)
  })

  it('rejects absolute path outside root', () => {
    // Absolute path /etc resolves to /etc, which is outside /tmp/safe-root
    expect(() => assertPathInside('/etc', '/tmp/safe-root')).toThrow(PathTraversalError)
  })

  it('includes candidate path in error message', () => {
    try {
      assertPathInside('../malicious', root)
    } catch (err) {
      expect(err).toBeInstanceOf(PathTraversalError)
      expect((err as PathTraversalError).candidatePath).toBe('../malicious')
      expect((err as PathTraversalError).message).toContain('../malicious')
    }
  })

  it('includes reason in error message for empty path', () => {
    try {
      assertPathInside('', root)
    } catch (err) {
      expect((err as PathTraversalError).message).toContain('empty path')
    }
  })

  it('includes reason in error message for .. traversal', () => {
    try {
      assertPathInside('../foo', root)
    } catch (err) {
      expect((err as PathTraversalError).message).toContain("path contains '..' traversal")
    }
  })
})
