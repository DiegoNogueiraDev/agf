import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { KanbanBoard, type KanbanNode } from '../tui/components/KanbanBoard.js'

const nodes: KanbanNode[] = [
  { id: '1', type: 'task', title: 'Z task', status: 'backlog' },
  { id: '2', type: 'task', title: 'A task', status: 'backlog' },
  { id: '3', type: 'task', title: 'M task', status: 'backlog' },
]

describe('KanbanBoard sort', () => {
  it('ordena por título ASC', () => {
    const { lastFrame } = render(<KanbanBoard nodes={nodes} sortBy="title" sortDir="asc" />)
    const frame = lastFrame() ?? ''
    const aIdx = frame.indexOf('A task')
    const mIdx = frame.indexOf('M task')
    const zIdx = frame.indexOf('Z task')
    expect(aIdx).toBeLessThan(mIdx)
    expect(mIdx).toBeLessThan(zIdx)
  })

  it('ordena por título DESC', () => {
    const { lastFrame } = render(<KanbanBoard nodes={nodes} sortBy="title" sortDir="desc" />)
    const frame = lastFrame() ?? ''
    const aIdx = frame.indexOf('A task')
    const zIdx = frame.indexOf('Z task')
    expect(zIdx).toBeLessThan(aIdx)
  })

  it('sem sort mantém ordem original', () => {
    const { lastFrame } = render(<KanbanBoard nodes={nodes} />)
    const frame = lastFrame() ?? ''
    const zIdx = frame.indexOf('Z task')
    const aIdx = frame.indexOf('A task')
    expect(zIdx).toBeLessThan(aIdx)
  })
})
