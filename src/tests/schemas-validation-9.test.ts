/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Schema validation tests — batch 9: listener-schema, log.schema, node.schema,
 * permissions-profile, permissions.schema
 */

import { describe, it, expect } from 'vitest'
import {
  StaleTaskSchema,
  TechDebtIndicatorSchema,
  BacklogAgingSchema,
  BacklogHealthReportSchema,
  ListenerReadinessCheckSchema,
  ListenerReadinessReportSchema,
} from '../schemas/listener-schema.js'
import { LogLevelSchema, LogLayerSchema, LogEntrySchema } from '../schemas/log.schema.js'
import {
  NodeTypeSchema,
  NodeStatusSchema,
  XpSizeSchema,
  PrioritySchema,
  SourceRefSchema,
  GraphNodeSchema,
} from '../schemas/node.schema.js'
import {
  PermissionProfileTomlSchema,
  WorkspaceRootEntrySchema,
  BUILT_IN_PROFILE_NAMES,
  builtInProfiles,
  isBuiltInProfile,
  parseSpecialPath,
  validateExtends,
  resolveProfile,
  compileProfile,
} from '../schemas/permissions-profile.schema.js'
import {
  FileSystemAccessModeSchema,
  FileSystemSandboxKindSchema,
  FileSystemSpecialPathTypeSchema,
  FileSystemPathSchema,
  FileSystemSandboxEntrySchema,
  FileSystemSandboxPolicySchema,
  NetworkSandboxKindSchema,
  NetworkSandboxPolicySchema,
  PermissionsProfileSchema,
  isValidBuiltInProfile,
} from '../schemas/permissions.schema.js'

// ── listener-schema ──

describe('StaleTaskSchema', () => {
  it('should accept valid stale task', () => {
    const s = StaleTaskSchema.parse({ nodeId: 'n1', title: 'Old task', daysInBacklog: 30 })
    expect(s.daysInBacklog).toBe(30)
  })

  it('should reject negative days', () => {
    expect(() => StaleTaskSchema.parse({ nodeId: 'n1', title: 'Old', daysInBacklog: -1 })).toThrow()
  })
})

describe('TechDebtIndicatorSchema', () => {
  it('should accept valid indicator', () => {
    const t = TechDebtIndicatorSchema.parse({ nodeId: 'n1', title: 'Debt', keywords: ['refactor', 'hack'] })
    expect(t.keywords).toHaveLength(2)
  })
})

describe('BacklogAgingSchema', () => {
  it('should accept valid aging', () => {
    const a = BacklogAgingSchema.parse({ avgDays: 15, maxDays: 60 })
    expect(a.maxDays).toBe(60)
  })
})

describe('BacklogHealthReportSchema', () => {
  it('should accept valid report', () => {
    const r = BacklogHealthReportSchema.parse({
      backlogCount: 20,
      readyCount: 5,
      staleTasks: [],
      techDebtIndicators: [],
      cleanForNewCycle: true,
      typeDistribution: { task: 15 },
      priorityDistribution: { '3': 10 },
      aging: { avgDays: 10, maxDays: 30 },
    })
    expect(r.backlogCount).toBe(20)
  })

  it('should reject negative counts', () => {
    expect(() =>
      BacklogHealthReportSchema.parse({
        backlogCount: -1,
        readyCount: 0,
        staleTasks: [],
        techDebtIndicators: [],
        cleanForNewCycle: true,
        typeDistribution: {},
        priorityDistribution: {},
        aging: { avgDays: 0, maxDays: 0 },
      }),
    ).toThrow()
  })
})

describe('ListenerReadinessCheckSchema', () => {
  it('should accept valid check', () => {
    const c = ListenerReadinessCheckSchema.parse({
      name: 'backlog-health',
      passed: true,
      details: 'ok',
      severity: 'required',
    })
    expect(c.name).toBe('backlog-health')
  })
})

describe('ListenerReadinessReportSchema', () => {
  it('should accept valid report', () => {
    const r = ListenerReadinessReportSchema.parse({
      checks: [],
      ready: true,
      score: 80,
      grade: 'B',
      summary: 'ready',
    })
    expect(r.grade).toBe('B')
  })

  it('should reject score > 100', () => {
    expect(() =>
      ListenerReadinessReportSchema.parse({
        checks: [],
        ready: true,
        score: 150,
        grade: 'A',
        summary: '',
      }),
    ).toThrow()
  })
})

// ── log.schema ──

describe('LogLevelSchema', () => {
  it('should accept valid levels', () => {
    expect(LogLevelSchema.parse('info')).toBe('info')
    expect(LogLevelSchema.parse('warn')).toBe('warn')
    expect(LogLevelSchema.parse('error')).toBe('error')
    expect(LogLevelSchema.parse('success')).toBe('success')
    expect(LogLevelSchema.parse('debug')).toBe('debug')
  })

  it('should reject invalid level', () => {
    expect(() => LogLevelSchema.parse('fatal')).toThrow()
  })
})

describe('LogLayerSchema', () => {
  it('should accept valid layers', () => {
    expect(LogLayerSchema.parse('core')).toBe('core')
    expect(LogLayerSchema.parse('cli')).toBe('cli')
    expect(LogLayerSchema.parse('rag')).toBe('rag')
  })

  it('should reject invalid layer', () => {
    expect(() => LogLayerSchema.parse('ui')).toThrow()
  })
})

describe('LogEntrySchema', () => {
  it('should accept valid entry', () => {
    const e = LogEntrySchema.parse({
      id: 1,
      level: 'info',
      message: 'started',
      timestamp: 't1',
    })
    expect(e.level).toBe('info')
  })

  it('should accept optional context and layer', () => {
    const e = LogEntrySchema.parse({
      id: 2,
      level: 'error',
      message: 'failed',
      context: { error: 'timeout' },
      timestamp: 't1',
      layer: 'core',
    })
    expect(e.context?.error).toBe('timeout')
    expect(e.layer).toBe('core')
  })

  it('should reject non-integer id', () => {
    expect(() => LogEntrySchema.parse({ id: 1.5, level: 'info', message: 'm', timestamp: 't' })).toThrow()
  })
})

// ── node.schema ──

describe('NodeTypeSchema', () => {
  it('should accept valid types', () => {
    expect(NodeTypeSchema.parse('epic')).toBe('epic')
    expect(NodeTypeSchema.parse('task')).toBe('task')
    expect(NodeTypeSchema.parse('browser_test')).toBe('browser_test')
  })

  it('should reject invalid type', () => {
    expect(() => NodeTypeSchema.parse('widget')).toThrow()
  })
})

describe('NodeStatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(NodeStatusSchema.parse('backlog')).toBe('backlog')
    expect(NodeStatusSchema.parse('done')).toBe('done')
  })
})

describe('XpSizeSchema', () => {
  it('should accept valid sizes', () => {
    expect(XpSizeSchema.parse('XS')).toBe('XS')
    expect(XpSizeSchema.parse('XL')).toBe('XL')
  })
})

describe('PrioritySchema', () => {
  it('should accept valid priorities', () => {
    expect(PrioritySchema.parse(1)).toBe(1)
    expect(PrioritySchema.parse(5)).toBe(5)
  })

  it('should reject invalid priorities', () => {
    expect(() => PrioritySchema.parse(0)).toThrow()
    expect(() => PrioritySchema.parse(6)).toThrow()
    expect(() => PrioritySchema.parse('high')).toThrow()
  })
})

describe('SourceRefSchema', () => {
  it('should accept valid source ref', () => {
    const s = SourceRefSchema.parse({ file: 'src/main.ts' })
    expect(s.file).toBe('src/main.ts')
  })

  it('should accept optional fields', () => {
    const s = SourceRefSchema.parse({ file: 'src/main.ts', startLine: 10, endLine: 20, confidence: 0.95 })
    expect(s.confidence).toBe(0.95)
  })

  it('should reject confidence > 1', () => {
    expect(() => SourceRefSchema.parse({ file: 'f.ts', confidence: 2 })).toThrow()
  })
})

describe('GraphNodeSchema', () => {
  const validNode = {
    id: 'n1',
    type: 'task',
    title: 'My Task',
    status: 'backlog',
    priority: 3,
    createdAt: 't1',
    updatedAt: 't2',
  }

  it('should accept valid node', () => {
    const n = GraphNodeSchema.parse(validNode)
    expect(n.title).toBe('My Task')
  })

  it('should accept full node with all optional fields', () => {
    const n = GraphNodeSchema.parse({
      ...validNode,
      description: 'desc',
      xpSize: 'M',
      estimateMinutes: 120,
      tags: ['frontend'],
      parentId: null,
      sprint: 'S1',
      sourceRef: { file: 'prd.md' },
      acceptanceCriteria: ['AC-1'],
      testFiles: ['test.ts'],
      blocked: true,
      metadata: { custom: 'val' },
    })
    expect(n.blocked).toBe(true)
    expect(n.tags).toHaveLength(1)
  })

  it('should default blocked to false', () => {
    const n = GraphNodeSchema.parse(validNode)
    expect(n.blocked).toBe(false)
  })

  it('should reject null id', () => {
    expect(() => GraphNodeSchema.parse({ ...validNode, id: null })).toThrow()
  })

  it('should reject invalid type', () => {
    expect(() => GraphNodeSchema.parse({ ...validNode, type: 'invalid' })).toThrow()
  })

  it('should reject null title', () => {
    expect(() => GraphNodeSchema.parse({ ...validNode, title: null })).toThrow()
  })

  it('should reject oversized title', () => {
    expect(() => GraphNodeSchema.parse({ ...validNode, title: 'x'.repeat(501) })).toThrow()
  })
})

// ── permissions-profile ──

describe('WorkspaceRootEntrySchema', () => {
  it('should accept valid entry', () => {
    const e = WorkspaceRootEntrySchema.parse({ path: '/workspace', access: 'Write' })
    expect(e.access).toBe('Write')
  })

  it('should reject empty path', () => {
    expect(() => WorkspaceRootEntrySchema.parse({ path: '', access: 'Read' })).toThrow()
  })

  it('should accept profile name with hyphens in extends', () => {
    const p = PermissionProfileTomlSchema.parse({
      filesystem: { kind: 'Restricted', entries: [] },
      network: { kind: 'Restricted' },
      extends: 'my-profile',
    })
    expect(p.extends).toBe('my-profile')
  })
})

describe('PermissionProfileTomlSchema', () => {
  it('should accept valid profile', () => {
    const p = PermissionProfileTomlSchema.parse({
      filesystem: { kind: 'Restricted', entries: [] },
      network: { kind: 'Restricted' },
    })
    expect(p.filesystem.kind).toBe('Restricted')
  })

  it('should accept full profile', () => {
    const p = PermissionProfileTomlSchema.parse({
      extends: ':read-only',
      filesystem: {
        kind: 'Restricted',
        entries: [{ path: '/tmp', access: 'Write' }],
      },
      network: {
        kind: 'Restricted',
        domains: { 'example.com': 'Allow' },
        unixSockets: {},
      },
      workspace_roots: [{ path: '/project', access: 'Read' }],
      description: 'My profile',
    })
    expect(p.extends).toBe(':read-only')
  })

  it('should reject invalid filesystem kind', () => {
    expect(() =>
      PermissionProfileTomlSchema.parse({
        filesystem: { kind: 'Unknown', entries: [] },
        network: { kind: 'Restricted' },
      }),
    ).toThrow()
  })
})

describe('BUILT_IN_PROFILE_NAMES', () => {
  it('should have three built-in profiles', () => {
    expect(BUILT_IN_PROFILE_NAMES).toEqual([':read-only', ':workspace', ':danger-full-access'])
  })
})

describe('builtInProfiles', () => {
  it('should have all three profiles', () => {
    expect(builtInProfiles[':read-only']).toBeDefined()
    expect(builtInProfiles[':workspace']).toBeDefined()
    expect(builtInProfiles[':danger-full-access']).toBeDefined()
  })

  it(':read-only should have Restricted filesystem', () => {
    expect(builtInProfiles[':read-only'].filesystem.kind).toBe('Restricted')
  })

  it(':danger-full-access should have Unrestricted filesystem', () => {
    expect(builtInProfiles[':danger-full-access'].filesystem.kind).toBe('Unrestricted')
  })

  it(':workspace should have Restricted network', () => {
    expect(builtInProfiles[':workspace'].network.kind).toBe('Restricted')
  })
})

describe('isBuiltInProfile', () => {
  it('should return true for built-in names', () => {
    expect(isBuiltInProfile(':read-only')).toBe(true)
    expect(isBuiltInProfile(':workspace')).toBe(true)
  })

  it('should return false for custom names', () => {
    expect(isBuiltInProfile('custom-profile')).toBe(false)
  })
})

describe('parseSpecialPath', () => {
  it('should parse known special paths', () => {
    expect(parseSpecialPath(':workspace_roots')).toBe('ProjectRoots')
    expect(parseSpecialPath(':root')).toBe('Root')
    expect(parseSpecialPath(':slash_tmp')).toBe('SlashTmp')
  })

  it('should return null for non-special paths', () => {
    expect(parseSpecialPath('/tmp')).toBeNull()
    expect(parseSpecialPath('normal/path')).toBeNull()
  })

  it('should return null for unknown special paths', () => {
    expect(parseSpecialPath(':nonexistent')).toBeNull()
  })
})

describe('validateExtends', () => {
  it('should return true for built-in profiles', () => {
    expect(validateExtends(':read-only', {}, [])).toBe(true)
  })

  it('should return false for non-existent profiles', () => {
    expect(validateExtends('nonexistent', {}, [])).toBe(false)
  })

  it('should detect circular extends', () => {
    const profiles: Record<string, any> = {
      a: { extends: 'b' },
      b: { extends: 'a' },
    }
    expect(validateExtends('a', profiles, [])).toBe(false)
  })
})

describe('resolveProfile', () => {
  it('should resolve built-in profile', () => {
    const p = resolveProfile(':read-only', {})
    expect(p.filesystem.kind).toBe('Restricted')
  })

  it('should fall back to :read-only for unknown custom with no default', () => {
    const p = resolveProfile('nonexistent', {})
    expect(p.filesystem.kind).toBe('Restricted')
  })

  it('should resolve custom profile with extends', () => {
    const custom: Record<string, any> = {
      'my-profile': {
        extends: ':read-only',
        filesystem: { kind: 'Restricted', entries: [{ path: '/custom', access: 'Write' }] },
        network: { kind: 'Restricted' },
      },
    }
    const p = resolveProfile('my-profile', custom)
    expect(p.filesystem.entries.length).toBeGreaterThanOrEqual(1)
  })
})

describe('compileProfile', () => {
  it('should return filesystem policy', () => {
    const policy = compileProfile({ filesystem: { kind: 'Restricted', entries: [] }, network: { kind: 'Restricted' } })
    expect(policy.kind).toBe('Restricted')
  })
})

// ── permissions.schema ──

describe('FileSystemAccessModeSchema', () => {
  it('should accept valid modes', () => {
    expect(FileSystemAccessModeSchema.parse('Read')).toBe('Read')
    expect(FileSystemAccessModeSchema.parse('Write')).toBe('Write')
    expect(FileSystemAccessModeSchema.parse('Deny')).toBe('Deny')
  })

  it('should reject invalid mode', () => {
    expect(() => FileSystemAccessModeSchema.parse('Execute')).toThrow()
  })
})

describe('FileSystemSandboxKindSchema', () => {
  it('should accept valid kinds', () => {
    expect(FileSystemSandboxKindSchema.parse('Restricted')).toBe('Restricted')
    expect(FileSystemSandboxKindSchema.parse('Unrestricted')).toBe('Unrestricted')
    expect(FileSystemSandboxKindSchema.parse('ExternalSandbox')).toBe('ExternalSandbox')
  })
})

describe('FileSystemSpecialPathTypeSchema', () => {
  it('should accept valid types', () => {
    expect(FileSystemSpecialPathTypeSchema.parse('Root')).toBe('Root')
    expect(FileSystemSpecialPathTypeSchema.parse('Tmpdir')).toBe('Tmpdir')
  })
})

describe('FileSystemPathSchema', () => {
  it('should accept Path type', () => {
    const p = FileSystemPathSchema.parse({ type: 'Path', path: '/tmp/file' })
    expect(p.path).toBe('/tmp/file')
  })

  it('should accept GlobPattern type', () => {
    const p = FileSystemPathSchema.parse({ type: 'GlobPattern', pattern: '*.ts' })
    expect(p.type).toBe('GlobPattern')
  })

  it('should accept Special type', () => {
    const p = FileSystemPathSchema.parse({ type: 'Special', value: 'Root' })
    expect(p.value).toBe('Root')
  })

  it('should reject invalid glob pattern', () => {
    expect(() => FileSystemPathSchema.parse({ type: 'GlobPattern', pattern: '[' })).toThrow()
  })

  it('should reject empty path', () => {
    expect(() => FileSystemPathSchema.parse({ type: 'Path', path: '' })).toThrow()
  })
})

describe('FileSystemSandboxEntrySchema', () => {
  it('should accept valid entry', () => {
    const e = FileSystemSandboxEntrySchema.parse({
      path: { type: 'Path', path: '/tmp' },
      access: 'Write',
    })
    expect(e.access).toBe('Write')
  })
})

describe('FileSystemSandboxPolicySchema', () => {
  it('should accept valid policy', () => {
    const p = FileSystemSandboxPolicySchema.parse({ kind: 'Restricted', entries: [] })
    expect(p.kind).toBe('Restricted')
  })

  it('should default entries to []', () => {
    const p = FileSystemSandboxPolicySchema.parse({ kind: 'Unrestricted' })
    expect(p.entries).toEqual([])
  })
})

describe('NetworkSandboxKindSchema', () => {
  it('should accept valid kinds', () => {
    expect(NetworkSandboxKindSchema.parse('Restricted')).toBe('Restricted')
    expect(NetworkSandboxKindSchema.parse('Enabled')).toBe('Enabled')
  })
})

describe('NetworkSandboxPolicySchema', () => {
  it('should accept valid policy', () => {
    const p = NetworkSandboxPolicySchema.parse({ kind: 'Restricted' })
    expect(p.kind).toBe('Restricted')
  })

  it('should accept with domains', () => {
    const p = NetworkSandboxPolicySchema.parse({
      kind: 'Restricted',
      domains: { 'api.example.com': 'Allow' },
    })
    expect(p.domains!['api.example.com']).toBe('Allow')
  })
})

describe('PermissionsProfileSchema', () => {
  it('should accept valid profile', () => {
    const p = PermissionsProfileSchema.parse({
      name: 'test-profile',
      filesystem: { kind: 'Restricted', entries: [] },
      network: { kind: 'Restricted' },
    })
    expect(p.name).toBe('test-profile')
  })
})

describe('isValidBuiltInProfile', () => {
  it('should validate built-in names', () => {
    expect(isValidBuiltInProfile(':read-only')).toBe(true)
    expect(isValidBuiltInProfile(':workspace')).toBe(true)
    expect(isValidBuiltInProfile(':danger-full-access')).toBe(true)
  })

  it('should reject custom names', () => {
    expect(isValidBuiltInProfile('custom')).toBe(false)
  })
})
