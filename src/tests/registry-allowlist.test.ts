import { describe, it, expect } from 'vitest'
import { isPinnedNpmSpec, parseNpxCommand, assertTrustedMcpServer } from '../core/security/registry-allowlist.js'
import type { McpServerSpec } from '../core/security/registry-allowlist.js'

describe('isPinnedNpmSpec', () => {
  it('accepts scoped package with exact semver', () => {
    expect(isPinnedNpmSpec('@modelcontextprotocol/server-filesystem@0.6.2')).toBe(true)
  })

  it('accepts unscoped package with exact semver', () => {
    expect(isPinnedNpmSpec('typescript@5.4.5')).toBe(true)
  })

  it('accepts prerelease semver', () => {
    expect(isPinnedNpmSpec('my-pkg@1.0.0-alpha.1')).toBe(true)
  })

  it('rejects tag reference like @latest', () => {
    expect(isPinnedNpmSpec('my-pkg@latest')).toBe(false)
  })

  it('rejects version range like ^1.0.0', () => {
    expect(isPinnedNpmSpec('my-pkg@^1.0.0')).toBe(false)
  })

  it('rejects package with no version', () => {
    expect(isPinnedNpmSpec('my-pkg')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isPinnedNpmSpec('')).toBe(false)
  })

  it('accepts github: spec with full SHA', () => {
    const sha = 'a'.repeat(40)
    expect(isPinnedNpmSpec(`github:user/repo#${sha}`)).toBe(true)
  })

  it('rejects github: spec with short SHA', () => {
    expect(isPinnedNpmSpec('github:user/repo#abc123')).toBe(false)
  })

  it('accepts git+ spec with full SHA', () => {
    const sha = 'b'.repeat(40)
    expect(isPinnedNpmSpec(`git+https://github.com/u/r#${sha}`)).toBe(true)
  })
})

describe('parseNpxCommand', () => {
  it('returns null for non-npx command', () => {
    expect(parseNpxCommand('node', ['server.js'])).toBeNull()
  })

  it('parses unscoped package name', () => {
    const result = parseNpxCommand('npx', ['create-react-app', 'my-app'])
    expect(result).not.toBeNull()
    expect(result?.spec).toBe('create-react-app')
    expect(result?.scope).toBeNull()
    expect(result?.name).toBe('create-react-app')
  })

  it('parses scoped package name', () => {
    const result = parseNpxCommand('npx', ['@modelcontextprotocol/server-filesystem'])
    expect(result).not.toBeNull()
    expect(result?.scope).toBe('@modelcontextprotocol')
    expect(result?.name).toBe('server-filesystem')
  })

  it('skips flag arguments', () => {
    const result = parseNpxCommand('npx', ['--yes', 'vitest'])
    expect(result?.spec).toBe('vitest')
  })

  it('skips -p flag and its value', () => {
    const result = parseNpxCommand('npx', ['-p', 'typescript', 'tsc'])
    expect(result?.spec).toBe('tsc')
  })

  it('returns null when no non-flag arg exists', () => {
    expect(parseNpxCommand('npx', ['--yes', '--no'])).toBeNull()
  })
})

describe('assertTrustedMcpServer', () => {
  it('does not throw for allowed command node', () => {
    const spec: McpServerSpec = { command: 'node', args: ['server.js'] }
    expect(() => assertTrustedMcpServer(spec)).not.toThrow()
  })

  it('does not throw for allowed command npx', () => {
    const spec: McpServerSpec = { command: 'npx', args: ['@modelcontextprotocol/server@1.0.0'] }
    expect(() => assertTrustedMcpServer(spec)).not.toThrow()
  })

  it('throws for untrusted command', () => {
    const spec: McpServerSpec = { command: 'curl', args: [] }
    expect(() => assertTrustedMcpServer(spec)).toThrow()
  })

  it('accepts custom allowed command via options', () => {
    const spec: McpServerSpec = { command: 'python', args: ['server.py'] }
    expect(() => assertTrustedMcpServer(spec, { allowedCommands: ['python'] })).not.toThrow()
  })
})
