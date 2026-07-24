import { describe, it, expect } from 'vitest'
import { safeArg, safeArgv, assertCdpMethod } from '../core/security/stdio-sanitizer.js'
import { StdioSanitizationError } from '../core/utils/errors.js'

describe('safeArg', () => {
  it('accepts a plain path', () => {
    expect(safeArg('/tmp/file.txt', 'path')).toBe('/tmp/file.txt')
  })

  it('rejects path traversal', () => {
    expect(() => safeArg('../secret', 'path')).toThrow(StdioSanitizationError)
  })

  it('rejects file:// URI in path', () => {
    expect(() => safeArg('file:///etc/passwd', 'path')).toThrow(StdioSanitizationError)
  })

  it('accepts https URL', () => {
    expect(safeArg('https://example.com', 'url')).toBe('https://example.com')
  })

  it('rejects ftp URL', () => {
    expect(() => safeArg('ftp://example.com', 'url')).toThrow(StdioSanitizationError)
  })

  it('accepts valid identifier', () => {
    expect(safeArg('my_tool_1', 'identifier')).toBe('my_tool_1')
  })

  it('rejects identifier with space', () => {
    expect(() => safeArg('my tool', 'identifier')).toThrow(StdioSanitizationError)
  })

  it('accepts benign command arg', () => {
    expect(safeArg('hello', 'command-arg')).toBe('hello')
  })

  it('rejects semicolon in command-arg', () => {
    expect(() => safeArg('foo; rm -rf /', 'command-arg')).toThrow(StdioSanitizationError)
  })

  it('rejects value with NUL byte', () => {
    expect(() => safeArg('foo\x00bar', 'path')).toThrow(StdioSanitizationError)
  })

  it('rejects value longer than 4096 bytes', () => {
    expect(() => safeArg('a'.repeat(4097), 'command-arg')).toThrow(StdioSanitizationError)
  })
})

describe('safeArgv', () => {
  it('maps safeArg over an array', () => {
    expect(safeArgv(['foo', 'bar'], 'command-arg')).toEqual(['foo', 'bar'])
  })

  it('throws on first bad element', () => {
    expect(() => safeArgv(['ok', 'bad; thing'], 'command-arg')).toThrow(StdioSanitizationError)
  })
})

describe('assertCdpMethod', () => {
  it('passes on allowed CDP method', () => {
    expect(() => assertCdpMethod('Page.navigate')).not.toThrow()
  })

  it('throws on denied method', () => {
    expect(() => assertCdpMethod('Browser.close')).toThrow(StdioSanitizationError)
  })

  it('throws on unknown domain', () => {
    expect(() => assertCdpMethod('Unknown.method')).toThrow(StdioSanitizationError)
  })
})
