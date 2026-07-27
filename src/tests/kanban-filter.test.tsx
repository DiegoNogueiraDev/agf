import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { KanbanBoard, type KanbanNode } from '../tui/components/KanbanBoard.js'

const nodes: KanbanNode[] = [
  { id: '1', type: 'task', title: 'Implement login', status: 'in_progress' },
  { id: '2', type: 'task', title: 'Fix auth bug', status: 'backlog' },
  { id: '3', type: 'task', title: 'Add tests', status: 'done' },
]

describe('KanbanBoard filter', () => {
  it('mostra todas tasks sem filtro', () => {
    const { lastFrame } = render(<KanbanBoard nodes={nodes} filterText="" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Implement login')
    expect(frame).toContain('Fix auth bug')
    expect(frame).toContain('Add tests')
  })

  it('filtra por texto', () => {
    const { lastFrame } = render(<KanbanBoard nodes={nodes} filterText="login" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Implement login')
    expect(frame).not.toContain('Fix auth bug')
  })

  it('filtro case-insensitive', () => {
    const { lastFrame } = render(<KanbanBoard nodes={nodes} filterText="AUTH" />)
    expect(lastFrame() ?? '').toContain('Fix auth bug')
  })

  it('mostra mensagem quando filtro não encontra nada', () => {
    const { lastFrame } = render(<KanbanBoard nodes={nodes} filterText="zzznonexistent" />)
    expect(lastFrame() ?? '').toContain('Nenhuma task')
  })
})
