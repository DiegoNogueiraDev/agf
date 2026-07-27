import { describe, it, expect } from 'vitest'
import { PermissionsGate, assessPatchSafety, SafetyCheck } from '../core/security/permissions-gate.js'
import type { FileSystemSandboxPolicy, NetworkSandboxPolicy } from '../schemas/permissions.schema.js'

const fsPolicy: FileSystemSandboxPolicy = {
  kind: 'Restricted',
  entries: [
    { path: { type: 'Path', path: '/home/user' }, access: 'Write' },
    { path: { type: 'Path', path: '/home/user/.git' }, access: 'Deny' },
    { path: { type: 'Path', path: '/tmp' }, access: 'Write' },
  ],
}

const networkPolicyRestricted: NetworkSandboxPolicy = {
  kind: 'Restricted',
}

const networkPolicyEnabled: NetworkSandboxPolicy = {
  kind: 'Enabled',
  domains: { 'api.example.com': 'Allow' },
}

describe('PermissionsGate.check', () => {
  const gate = new PermissionsGate(fsPolicy, networkPolicyRestricted)

  it('should allow command reading from permitted path', () => {
    const result = gate.check({ command: 'cat /home/user/docs/file.txt', cwd: '/home/user' })
    expect(result.allowed).toBe(true)
  })

  it('should deny command writing to unpermitted path', () => {
    const result = gate.check({ command: 'rm -rf /etc/passwd', cwd: '/home/user' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('should deny network access when network is Restricted', () => {
    const result = gate.check({ command: 'curl https://api.example.com', cwd: '/home/user' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('network')
  })

  it('should allow network access when network is Enabled', () => {
    const enabledGate = new PermissionsGate(fsPolicy, networkPolicyEnabled)
    const result = enabledGate.check({ command: 'curl https://api.example.com', cwd: '/home/user' })
    expect(result.allowed).toBe(true)
  })

  it('should deny writing to metadata path', () => {
    const result = gate.check({ command: 'echo "config" >> /home/user/.git/config', cwd: '/home/user' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('should allow safe read-only commands', () => {
    const result = gate.check({ command: 'ls -la /home/user', cwd: '/home/user' })
    expect(result.allowed).toBe(true)
  })

  // Regression (node_1a5efcd09ed7): extractPaths only saw tokens starting with a bare
  // /, ./ or ../, so a quoted path or a relative traversal without a leading dot slipped
  // past the gate entirely (never validated → allowed) — a gate bypass to a denied path.
  it('denies a QUOTED absolute path to a denied location', () => {
    expect(gate.check({ command: 'rm -rf "/etc/passwd"', cwd: '/home/user' }).allowed).toBe(false)
    expect(gate.check({ command: "rm -rf '/etc/shadow'", cwd: '/home/user' }).allowed).toBe(false)
  })

  it('denies a flag-attached path to a denied location (--flag=/path)', () => {
    expect(gate.check({ command: 'tool --output=/etc/cron.d/evil', cwd: '/home/user' }).allowed).toBe(false)
  })

  it('denies a relative traversal path without a leading ./', () => {
    expect(gate.check({ command: 'rm -rf sub/../../../etc/passwd', cwd: '/home/user' }).allowed).toBe(false)
  })

  it('still allows a quoted path inside a permitted location (no false deny)', () => {
    expect(gate.check({ command: 'cat "/home/user/notes.txt"', cwd: '/home/user' }).allowed).toBe(true)
  })

  it('should extract filesystem paths from command args', () => {
    const paths = gate.extractPaths('cat /home/user/file.txt /tmp/build.log')
    expect(paths).toContain('/home/user/file.txt')
    expect(paths).toContain('/tmp/build.log')
  })

  it('should extract URLs from command for network check', () => {
    const urls = gate.extractUrls('curl https://api.example.com/v1/data')
    expect(urls).toContain('api.example.com')
  })
})

describe('PermissionsGate.checkRead', () => {
  const gate = new PermissionsGate(fsPolicy, networkPolicyRestricted)

  it('should allow read on permitted path', () => {
    expect(gate.checkRead('/home/user/docs/file.txt', '/home/user').allowed).toBe(true)
  })

  it('should deny read on metadata path', () => {
    expect(gate.checkRead('/home/user/.git/config', '/home/user').allowed).toBe(false)
  })

  it('should deny read on unpermitted path', () => {
    expect(gate.checkRead('/etc/shadow', '/').allowed).toBe(false)
  })
})

describe('PermissionsGate.checkWrite', () => {
  const gate = new PermissionsGate(fsPolicy, networkPolicyRestricted)

  it('should allow write on writable path', () => {
    expect(gate.checkWrite('/home/user/docs/new.txt', '/home/user').allowed).toBe(true)
  })

  it('should deny write on read-only path', () => {
    expect(gate.checkWrite('/etc/hosts', '/').allowed).toBe(false)
  })

  it('should deny write on metadata path', () => {
    expect(gate.checkWrite('/home/user/.git/config', '/home/user').allowed).toBe(false)
  })
})

describe('assessPatchSafety', () => {
  it('should return AutoApprove for writable path', () => {
    const result = assessPatchSafety({
      path: '/home/user/docs/new.txt',
      cwd: '/home/user',
      policy: fsPolicy,
    })
    expect(result).toBe('AutoApprove')
  })

  it('should return Reject for metadata path', () => {
    const result = assessPatchSafety({
      path: '/home/user/.git/config',
      cwd: '/home/user',
      policy: fsPolicy,
    })
    expect(result).toBe('Reject')
  })

  it('should return AskUser for unpermitted path', () => {
    const result = assessPatchSafety({
      path: '/etc/hosts',
      cwd: '/',
      policy: fsPolicy,
    })
    expect(result).toBe('AskUser')
  })
})
