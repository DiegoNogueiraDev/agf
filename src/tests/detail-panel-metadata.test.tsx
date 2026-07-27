import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { DetailPanel, type DetailNode } from '../tui/components/DetailPanel.js'

const baseNode: DetailNode = {
  id: 'node_abc',
  title: 'Test Node',
  type: 'task',
  status: 'in_progress',
  priority: 2,
  children: [],
  blockers: [],
}

describe('DetailPanel metadados', () => {
  it('mostra createdAt quando fornecido', () => {
    const { lastFrame } = render(<DetailPanel node={{ ...baseNode, createdAt: '2026-06-12T10:00:00Z' }} />)
    expect(lastFrame() ?? '').toContain('2026-06-12')
  })

  it('mostra weight e accessCount quando fornecidos', () => {
    const { lastFrame } = render(<DetailPanel node={{ ...baseNode, weight: 3, accessCount: 42 }} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Weight: 3')
    expect(frame).toContain('Access: 42')
  })

  it('não mostra metadados quando ausentes', () => {
    const { lastFrame } = render(<DetailPanel node={baseNode} />)
    expect(lastFrame() ?? '').not.toContain('Metadata')
  })

  it('mostra tags quando presentes', () => {
    const { lastFrame } = render(<DetailPanel node={{ ...baseNode, tags: ['tui', 'epic-6'] }} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('tui')
    expect(frame).toContain('epic-6')
  })
})
