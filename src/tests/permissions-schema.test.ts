import { describe, it, expect } from 'vitest'
import {
  FileSystemAccessMode,
  FileSystemSandboxKind,
  FileSystemSpecialPathType,
  NetworkSandboxKind,
  FileSystemPathSchema,
  FileSystemSandboxEntrySchema,
  FileSystemSandboxPolicySchema,
  NetworkSandboxPolicySchema,
  PermissionsProfileSchema,
} from '../schemas/permissions.schema.js'

describe('FileSystemAccessMode', () => {
  it('should define Read', () => {
    expect(FileSystemAccessMode.Read).toBe('Read')
  })

  it('should define Write', () => {
    expect(FileSystemAccessMode.Write).toBe('Write')
  })

  it('should define Deny', () => {
    expect(FileSystemAccessMode.Deny).toBe('Deny')
  })

  it('should resolve cascade precedence Deny > Write > Read', () => {
    const order = [FileSystemAccessMode.Read, FileSystemAccessMode.Write, FileSystemAccessMode.Deny]
    expect(order.indexOf(FileSystemAccessMode.Deny)).toBe(2)
  })
})

describe('FileSystemSandboxKind', () => {
  it('should define Restricted', () => {
    expect(FileSystemSandboxKind.Restricted).toBe('Restricted')
  })

  it('should define Unrestricted', () => {
    expect(FileSystemSandboxKind.Unrestricted).toBe('Unrestricted')
  })

  it('should define ExternalSandbox', () => {
    expect(FileSystemSandboxKind.ExternalSandbox).toBe('ExternalSandbox')
  })
})

describe('FileSystemSpecialPathType', () => {
  it('should define Root', () => {
    expect(FileSystemSpecialPathType.Root).toBe('Root')
  })

  it('should define Minimal', () => {
    expect(FileSystemSpecialPathType.Minimal).toBe('Minimal')
  })

  it('should define ProjectRoots', () => {
    expect(FileSystemSpecialPathType.ProjectRoots).toBe('ProjectRoots')
  })

  it('should define Tmpdir', () => {
    expect(FileSystemSpecialPathType.Tmpdir).toBe('Tmpdir')
  })

  it('should define SlashTmp', () => {
    expect(FileSystemSpecialPathType.SlashTmp).toBe('SlashTmp')
  })
})

describe('NetworkSandboxKind', () => {
  it('should define Restricted', () => {
    expect(NetworkSandboxKind.Restricted).toBe('Restricted')
  })

  it('should define Enabled', () => {
    expect(NetworkSandboxKind.Enabled).toBe('Enabled')
  })
})

describe('FileSystemPathSchema', () => {
  it('should accept exact path', () => {
    const result = FileSystemPathSchema.safeParse({ type: 'Path', path: '/home/user/project' })
    expect(result.success).toBe(true)
  })

  it('should accept glob pattern', () => {
    const result = FileSystemPathSchema.safeParse({ type: 'GlobPattern', pattern: '**/*.env' })
    expect(result.success).toBe(true)
  })

  it('should accept special path', () => {
    const result = FileSystemPathSchema.safeParse({ type: 'Special', value: 'Root' })
    expect(result.success).toBe(true)
  })

  it('should reject invalid glob pattern', () => {
    const result = FileSystemPathSchema.safeParse({ type: 'GlobPattern', pattern: '[' })
    expect(result.success).toBe(false)
  })

  it('should reject special path with unknown value', () => {
    const result = FileSystemPathSchema.safeParse({ type: 'Special', value: 'Unknown' })
    expect(result.success).toBe(false)
  })
})

describe('FileSystemSandboxEntrySchema', () => {
  it('should accept valid entry with Path', () => {
    const result = FileSystemSandboxEntrySchema.safeParse({
      path: { type: 'Path', path: '/home/user' },
      access: 'Write',
    })
    expect(result.success).toBe(true)
  })

  it('should reject entry with invalid access mode', () => {
    const result = FileSystemSandboxEntrySchema.safeParse({
      path: { type: 'Path', path: '/tmp' },
      access: 'Invalid',
    })
    expect(result.success).toBe(false)
  })
})

describe('FileSystemSandboxPolicySchema', () => {
  it('should accept valid policy with entries', () => {
    const result = FileSystemSandboxPolicySchema.safeParse({
      kind: 'Restricted',
      entries: [
        { path: { type: 'Path', path: '/home/user' }, access: 'Write' },
        { path: { type: 'Path', path: '/home/user/.git' }, access: 'Deny' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('should accept ExternalSandbox without entries', () => {
    const result = FileSystemSandboxPolicySchema.safeParse({
      kind: 'ExternalSandbox',
    })
    expect(result.success).toBe(true)
  })

  it('should reject invalid sandbox kind', () => {
    const result = FileSystemSandboxPolicySchema.safeParse({
      kind: 'FakeKind',
    })
    expect(result.success).toBe(false)
  })
})

describe('NetworkSandboxPolicySchema', () => {
  it('should accept Restricted policy', () => {
    const result = NetworkSandboxPolicySchema.safeParse({ kind: 'Restricted' })
    expect(result.success).toBe(true)
  })

  it('should accept Enabled policy with domain rules', () => {
    const result = NetworkSandboxPolicySchema.safeParse({
      kind: 'Enabled',
      domains: {
        'api.example.com': 'Allow',
        'evil.com': 'Deny',
      },
    })
    expect(result.success).toBe(true)
  })

  it('should accept Unix socket rules', () => {
    const result = NetworkSandboxPolicySchema.safeParse({
      kind: 'Enabled',
      unixSockets: {
        '/var/run/docker.sock': 'Allow',
      },
    })
    expect(result.success).toBe(true)
  })

  it('should reject invalid domain action', () => {
    const result = NetworkSandboxPolicySchema.safeParse({
      kind: 'Enabled',
      domains: { 'api.example.com': 'Maybe' },
    })
    expect(result.success).toBe(false)
  })
})

describe('PermissionsProfileSchema', () => {
  it('should accept minimal profile', () => {
    const result = PermissionsProfileSchema.safeParse({
      name: ':workspace',
      filesystem: {
        kind: 'Restricted',
        entries: [
          { path: { type: 'Special', value: 'ProjectRoots' }, access: 'Write' },
          { path: { type: 'Special', value: 'Tmpdir' }, access: 'Write' },
        ],
      },
      network: { kind: 'Restricted' },
    })
    expect(result.success).toBe(true)
  })

  it('should accept profile with extends', () => {
    const result = PermissionsProfileSchema.safeParse({
      name: 'my-profile',
      extends: ':workspace',
      filesystem: {
        kind: 'Restricted',
        entries: [{ path: { type: 'Special', value: 'ProjectRoots' }, access: 'Write' }],
      },
      network: { kind: 'Enabled' },
    })
    expect(result.success).toBe(true)
  })

  it('should reject profile without filesystem', () => {
    const result = PermissionsProfileSchema.safeParse({
      name: ':test',
    })
    expect(result.success).toBe(false)
  })
})
