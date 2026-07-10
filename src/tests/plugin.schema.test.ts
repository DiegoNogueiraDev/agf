import { describe, it, expect } from 'vitest'
import { PluginCapabilitySchema, PluginManifestSchema } from '../schemas/plugin.schema.js'

describe('PluginCapabilitySchema', () => {
  it('accepts all valid capabilities', () => {
    for (const cap of [
      'analyzer',
      'validator',
      'template',
      'tool',
      'classifier_pattern',
      'knowledge_source',
      'event_handler',
    ]) {
      expect(PluginCapabilitySchema.safeParse(cap).success).toBe(true)
    }
  })

  it('rejects unknown capability', () => {
    expect(PluginCapabilitySchema.safeParse('scraper').success).toBe(false)
  })
})

describe('PluginManifestSchema', () => {
  const valid = {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'A useful plugin',
    entryPoint: 'dist/index.js',
    capabilities: ['analyzer'],
  }

  it('accepts a valid manifest', () => {
    expect(PluginManifestSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects invalid version format', () => {
    expect(PluginManifestSchema.safeParse({ ...valid, version: '1.0' }).success).toBe(false)
  })

  it('rejects empty capabilities', () => {
    expect(PluginManifestSchema.safeParse({ ...valid, capabilities: [] }).success).toBe(false)
  })

  it('rejects invalid repository URL', () => {
    expect(PluginManifestSchema.safeParse({ ...valid, repository: 'not-a-url' }).success).toBe(false)
  })

  it('accepts optional repository URL', () => {
    expect(PluginManifestSchema.safeParse({ ...valid, repository: 'https://github.com/x/y' }).success).toBe(true)
  })
})
