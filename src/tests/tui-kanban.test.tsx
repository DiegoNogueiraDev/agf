import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { KanbanBoard, type KanbanNode } from '../tui/components/KanbanBoard.js'

const now = '2026-06-05T12:00:00Z'

const sampleNodes: KanbanNode[] = [
  { id: 'n1', type: 'task', title: 'Task Backlog', status: 'backlog' },
  { id: 'n2', type: 'task', title: 'Task Ready', status: 'ready' },
  { id: 'n3', type: 'task', title: 'Task In Progress', status: 'in_progress', parentId: 'epic-1' },
  { id: 'n4', type: 'task', title: 'Task Blocked', status: 'blocked' },
  { id: 'n5', type: 'task', title: 'Task Done', status: 'done' },
  { id: 'epic-1', type: 'epic', title: 'Epic Principal', status: 'in_progress' },
]

describe('KanbanBoard (TUI)', () => {
  it('renderiza as 5 colunas', () => {
    const { lastFrame } = render(<KanbanBoard nodes={sampleNodes} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Backlog')
    expect(frame).toContain('Ready')
    expect(frame).toContain('In Progress')
    expect(frame).toContain('Blocked')
    expect(frame).toContain('Done')
  })

  it('renderiza os titulos das tasks', () => {
    const { lastFrame } = render(<KanbanBoard nodes={sampleNodes} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Task Backlog')
    expect(frame).toContain('Task Ready')
    expect(frame).toContain('Task In Progress')
    expect(frame).toContain('Task Blocked')
    expect(frame).toContain('Task Done')
  })

  it('mostra contagem de cards por coluna', () => {
    const { lastFrame } = render(<KanbanBoard nodes={sampleNodes} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('(1)') // cada coluna tem 1 card
  })

  it('indica WIP limit excedido', () => {
    const manyInProgress: KanbanNode[] = [
      ...sampleNodes,
      { id: 'n6', type: 'task', title: 'Task IP 2', status: 'in_progress' },
      { id: 'n7', type: 'task', title: 'Task IP 3', status: 'in_progress' },
      { id: 'n8', type: 'task', title: 'Task IP 4', status: 'in_progress' },
    ]
    const { lastFrame } = render(<KanbanBoard nodes={manyInProgress} wipLimits={{ in_progress: 2 }} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('4/2')
  })

  it('renderiza swimlanes por epic quando especificado', () => {
    const { lastFrame } = render(<KanbanBoard nodes={sampleNodes} swimlane="epic" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Epic Principal')
  })

  it('renderiza mensagem quando nao ha tasks', () => {
    const { lastFrame } = render(<KanbanBoard nodes={[]} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Nenhuma task')
  })

  it('renderiza swimlanes por sprint', () => {
    const sprintNodes: KanbanNode[] = [
      { id: 's1', type: 'task', title: 'Sprint Task', status: 'in_progress', sprint: 'Sprint-1' },
    ]
    const { lastFrame } = render(<KanbanBoard nodes={sprintNodes} swimlane="sprint" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Sprint-1')
  })
})
