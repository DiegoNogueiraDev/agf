import { describe, it, expect } from 'vitest'
import {
  KnowledgeDocumentExportSchema,
  KnowledgePackageManifestSchema,
  MemoryExportSchema,
} from '../schemas/knowledge-package.schema.js'

describe('KnowledgeDocumentExportSchema', () => {
  it('accepts a valid document export', () => {
    const result = KnowledgeDocumentExportSchema.safeParse({
      sourceType: 'upload',
      sourceId: 'doc-001',
      title: 'Project Architecture',
      content: '# Architecture\nDescribes the system.',
      contentHash: 'sha256:abc123',
      createdAt: '2026-06-22T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('accepts minimal document with optional fields omitted', () => {
    expect(
      KnowledgeDocumentExportSchema.safeParse({
        sourceType: 'memory',
        sourceId: 'mem-001',
        title: 'Empty doc',
        content: '',
        contentHash: 'sha256:empty',
        createdAt: '2026-06-22T00:00:00Z',
      }).success,
    ).toBe(true)
  })
})

describe('KnowledgePackageManifestSchema', () => {
  it('accepts a valid manifest', () => {
    expect(
      KnowledgePackageManifestSchema.safeParse({
        projectName: 'agent-graph-flow',
        exportedAt: '2026-06-22T00:00:00Z',
        documentCount: 10,
        memoryCount: 3,
        sourceTypes: ['upload', 'memory'],
        qualityThreshold: 0.8,
      }).success,
    ).toBe(true)
  })
})

describe('MemoryExportSchema', () => {
  it('accepts a valid memory export', () => {
    expect(
      MemoryExportSchema.safeParse({
        name: 'project-goal',
        content: 'The goal is to ship by Q3',
      }).success,
    ).toBe(true)
  })
})
