import { describe, it, expect } from 'vitest'
import { generateSpecDocument, validateSpecDocument } from '../core/spec-templates/spec-template-engine.js'
import type { SpecTemplate } from '../schemas/spec-template.schema.js'

function makeTemplate(overrides: Partial<SpecTemplate> = {}): SpecTemplate {
  return {
    name: 'Test Template',
    phase: 'ANALYZE',
    description: 'A template for testing',
    sections: [
      { title: 'Overview', description: 'Overview section', required: true },
      { title: 'Goals', description: 'Goals section', required: false },
    ],
    constitution: false,
    ...overrides,
  }
}

describe('generateSpecDocument', () => {
  it('produces a markdown document with section headings', () => {
    const doc = generateSpecDocument(makeTemplate(), {})
    expect(doc).toContain('## Overview')
    expect(doc).toContain('## Goals')
  })

  it('includes the template phase in the title', () => {
    const doc = generateSpecDocument(makeTemplate(), { projectName: 'MyProject' })
    expect(doc).toContain('ANALYZE')
    expect(doc).toContain('MyProject')
  })

  it('replaces {{variable}} placeholders', () => {
    const template = makeTemplate({
      sections: [{ title: 'Scope', description: 'Project: {{projectName}}', required: true }],
    })
    const doc = generateSpecDocument(template, { projectName: 'Acme' })
    expect(doc).toContain('Acme')
    expect(doc).not.toContain('{{projectName}}')
  })

  it('appends constitution principles when template.constitution=true', () => {
    const template = makeTemplate({ constitution: true })
    const doc = generateSpecDocument(template, {}, [{ id: 'p1', title: 'Honesty', description: 'Be honest' }])
    expect(doc).toContain('Constitution Principles')
    expect(doc).toContain('Honesty')
  })
})

describe('validateSpecDocument', () => {
  it('validates a document with all required sections present', () => {
    const template = makeTemplate()
    const content = '# ANALYZE: Test\n\n## Overview\nsome text\n\n## Goals\ntext\n'
    const result = validateSpecDocument(content, template)
    expect(result.valid).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('reports missing required sections', () => {
    const template = makeTemplate()
    const content = '# ANALYZE: Test\n\n## Goals\ntext\n'
    const result = validateSpecDocument(content, template)
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('Overview')
  })

  it('does not report optional missing sections as errors', () => {
    const template = makeTemplate({
      sections: [
        { title: 'Required', description: 'desc', required: true },
        { title: 'Optional', description: 'desc', required: false },
      ],
    })
    const content = '## Required\nsome content\n'
    const result = validateSpecDocument(content, template)
    expect(result.valid).toBe(true)
    expect(result.missing).not.toContain('Optional')
  })
})
