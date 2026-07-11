import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { KanbanBoard, type KanbanNode } from '../tui/components/KanbanBoard.js'
import { GraphTree } from '../tui/components/GraphTree.js'
import { CommandPalette } from '../tui/components/CommandPalette.js'
import { DiffPanel, type DiffLineItem } from '../tui/components/DiffPanel.js'
import { FooterBar } from '../tui/components/FooterBar.js'
import { App } from '../tui/app.js'
import type { DashboardModel } from '../tui/model.js'
import { COMMANDS } from '../tui/dispatch.js'

const sampleNodes: KanbanNode[] = [
  { id: 'n1', type: 'task', title: 'Task Backlog', status: 'backlog' },
  { id: 'n2', type: 'task', title: 'Task Ready', status: 'ready' },
  { id: 'n3', type: 'task', title: 'Task In Progress', status: 'in_progress', parentId: 'epic-1' },
  { id: 'n4', type: 'task', title: 'Task Blocked', status: 'blocked' },
  { id: 'n5', type: 'task', title: 'Task Done', status: 'done' },
  { id: 'epic-1', type: 'epic', title: 'Epic Principal', status: 'in_progress' },
]

const dashboardModel: DashboardModel = {
  projectName: 'demo',
  phase: 'IMPLEMENT',
  modelLabel: 'claude-sonnet-4.6',
  wip: 1,
  tasks: [
    { id: 'n3', title: 'Task In Progress', status: 'in_progress' },
    { id: 'n2', title: 'Task Ready', status: 'ready' },
  ],
  totalTasks: 5,
  tokens: { total: 1500, tokensIn: 1000, tokensOut: 500, costUsd: 0.003, calls: 3 },
}

describe('KanbanBoard snapshot', () => {
  it('renderiza kanban board match snapshot', () => {
    const { lastFrame } = render(<KanbanBoard nodes={sampleNodes} />)
    expect(lastFrame()).toMatchSnapshot()
  })

  it('renderiza kanban board vazio', () => {
    const { lastFrame } = render(<KanbanBoard nodes={[]} />)
    expect(lastFrame()).toBeDefined()
  })
})

describe('GraphTree snapshot', () => {
  it('renderiza arvore com nodes', () => {
    const nodes = [
      {
        id: 'epic-1',
        title: 'Epic 1',
        type: 'epic' as const,
        status: 'in_progress' as const,
        children: [
          { id: 'n1', title: 'Task 1', type: 'task' as const, status: 'backlog' as const },
          { id: 'n2', title: 'Task 2', type: 'task' as const, status: 'done' as const },
        ],
      },
    ]
    const { lastFrame } = render(<GraphTree nodes={nodes} />)
    expect(lastFrame()).toMatchSnapshot()
  })

  it('renderiza arvore vazia', () => {
    const { lastFrame } = render(<GraphTree nodes={[]} />)
    expect(lastFrame()).toBeDefined()
  })
})

describe('CommandPalette snapshot', () => {
  const select = () => {}
  const close = () => {}

  it('renderiza palette visivel com comandos', () => {
    const { lastFrame } = render(
      <CommandPalette commands={COMMANDS.slice(0, 5)} onSelect={select} onClose={close} visible={true} />,
    )
    expect(lastFrame()).toMatchSnapshot()
  })

  it('renderiza vazio quando invisivel', () => {
    const { lastFrame } = render(
      <CommandPalette commands={COMMANDS.slice(0, 5)} onSelect={select} onClose={close} visible={false} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toBe('')
  })
})

describe('DiffPanel snapshot', () => {
  it('renderiza diff com linhas', () => {
    const diffs: DiffLineItem[] = [
      { type: 'header', text: 'src/file1.ts' },
      { type: 'added', text: '+ const x = 1' },
      { type: 'removed', text: '- const y = 2' },
    ]
    const { lastFrame } = render(<DiffPanel diffs={diffs} />)
    expect(lastFrame()).toMatchSnapshot()
  })

  it('renderiza estado vazio', () => {
    const { lastFrame } = render(<DiffPanel diffs={[]} />)
    expect(lastFrame()).toMatchSnapshot()
  })
})

describe('FooterBar snapshot', () => {
  it('renderiza com props minimas', () => {
    const { lastFrame } = render(<FooterBar />)
    expect(lastFrame()).toMatchSnapshot()
  })

  it('renderiza com todas props', () => {
    const { lastFrame } = render(
      <FooterBar
        harnessScore={85}
        harnessGrade="A"
        tokenEstimate={1500}
        mode="EXECUTE"
        staleStatus="fresh"
        compactMode={false}
        helpHint="Next: Implement X"
        nextTask={{ title: 'Implement X', id: 'n1', reason: 'priority' }}
      />,
    )
    expect(lastFrame()).toMatchSnapshot()
  })
})

describe('App snapshot', () => {
  it('renderiza dashboard com tasks ativas', () => {
    const { lastFrame } = render(<App model={dashboardModel} />)
    expect(lastFrame()).toMatchSnapshot()
  })

  it('renderiza dashboard sem tasks', () => {
    const emptyModel: DashboardModel = {
      ...dashboardModel,
      tasks: [],
      totalTasks: 0,
    }
    const { lastFrame } = render(<App model={emptyModel} />)
    expect(lastFrame()).toMatchSnapshot()
  })
})
