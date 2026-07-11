import { describe, it, expect } from 'vitest'
import { resolveAccess, canReadPath, canWritePath, isMetadataProtected } from '../core/security/permissions-resolver.js'
import { FileSystemAccessMode, type FileSystemSandboxPolicy } from '../schemas/permissions.schema.js'

const testPolicy: FileSystemSandboxPolicy = {
  kind: 'Restricted',
  entries: [
    { path: { type: 'Path', path: '/home/user' }, access: 'Write' },
    { path: { type: 'Path', path: '/home/user/.git' }, access: 'Deny' },
    { path: { type: 'Path', path: '/tmp' }, access: 'Write' },
    { path: { type: 'GlobPattern', pattern: '**/*.env' }, access: 'Deny' },
  ],
}

const cwd = '/home/user/project'

describe('resolveAccess', () => {
  it('should return Write for writable path', () => {
    expect(resolveAccess('/home/user/docs', cwd, testPolicy)).toBe('Write')
  })

  it('should return Deny for path outside policy', () => {
    expect(resolveAccess('/etc/passwd', cwd, testPolicy)).toBe('Deny')
  })

  it('should use longest-prefix match (Deny beats Write)', () => {
    expect(resolveAccess('/home/user/.git/config', cwd, testPolicy)).toBe('Deny')
  })

  it('should return Deny for empty policy', () => {
    const empty: FileSystemSandboxPolicy = { kind: 'Restricted', entries: [] }
    expect(resolveAccess('/any/path', cwd, empty)).toBe('Deny')
  })

  it('should return Write for Unrestricted', () => {
    const unrestricted: FileSystemSandboxPolicy = { kind: 'Unrestricted', entries: [] }
    expect(resolveAccess('/any/path', cwd, unrestricted)).toBe('Write')
  })

  it('should resolve relative paths against cwd', () => {
    expect(resolveAccess('package.json', cwd, testPolicy)).toBe('Write')
  })

  it('should deny access to metadata paths under writable roots', () => {
    expect(resolveAccess('/home/user/.agents/config.toml', cwd, testPolicy)).toBe('Deny')
    expect(resolveAccess('/home/user/.codex/config.toml', cwd, testPolicy)).toBe('Deny')
  })
})

describe('canReadPath / canWritePath', () => {
  it('should allow read on writable path', () => {
    expect(canReadPath('/home/user/docs', cwd, testPolicy)).toBe(true)
  })

  it('should allow read on read-only path', () => {
    const readPolicy: FileSystemSandboxPolicy = {
      kind: 'Restricted',
      entries: [{ path: { type: 'Path', path: '/readonly' }, access: 'Read' }],
    }
    expect(canReadPath('/readonly/file.txt', '/', readPolicy)).toBe(true)
  })

  it('should deny write on read-only path', () => {
    const readPolicy: FileSystemSandboxPolicy = {
      kind: 'Restricted',
      entries: [{ path: { type: 'Path', path: '/readonly' }, access: 'Read' }],
    }
    expect(canWritePath('/readonly/file.txt', '/', readPolicy)).toBe(false)
  })

  it('should allow write on writable path', () => {
    expect(canWritePath('/tmp/build.log', cwd, testPolicy)).toBe(true)
  })

  it('should deny write on metadata path', () => {
    expect(canWritePath('/home/user/.git/config', cwd, testPolicy)).toBe(false)
  })
})

describe('isMetadataProtected', () => {
  it('should detect .git paths', () => {
    expect(isMetadataProtected('/home/user/.git/HEAD')).toBe(true)
  })

  it('should detect .agents paths', () => {
    expect(isMetadataProtected('/home/user/.agents/config.toml')).toBe(true)
  })

  it('should detect .codex paths', () => {
    expect(isMetadataProtected('/home/user/.codex/config.toml')).toBe(true)
  })

  it('should not flag normal paths', () => {
    expect(isMetadataProtected('/home/user/docs/file.txt')).toBe(false)
  })

  it('should not flag paths containing but not equal to metadata segments', () => {
    expect(isMetadataProtected('/home/user/my.git.config')).toBe(false)
  })
})
