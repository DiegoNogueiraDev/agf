/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_36e92a1653a0: promotes the auto-generated smoke test to real RTL
 * coverage of WorkflowGraph's most important user-facing behaviors.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkflowGraph } from './workflow-graph'
import type { GraphDocument, GraphNode } from '@/lib/types'

function node(id: string, title: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    title,
    type: 'task',
    status: 'backlog',
    priority: 3,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as GraphNode
}

function emptyGraph(): GraphDocument {
  return { nodes: [], edges: [] }
}

describe('<WorkflowGraph>', () => {
  it('shows the empty state when the graph has no nodes', () => {
    render(<WorkflowGraph graph={emptyGraph()} />)
    expect(screen.getByText('No nodes in graph')).toBeInTheDocument()
  })

  it('filters nodes by title via the Search field and shows the match count', async () => {
    const user = userEvent.setup()
    const graph: GraphDocument = {
      nodes: [node('n1', 'Fix login bug'), node('n2', 'Add dashboard chart')],
      edges: [],
    }
    render(<WorkflowGraph graph={graph} />)

    await user.type(screen.getByPlaceholderText('Search nodes…'), 'login')

    expect(await screen.findByText(/1 match for "login"/)).toBeInTheDocument()
  })

  it('shows "no matches" text when the search query matches nothing', async () => {
    const user = userEvent.setup()
    const graph: GraphDocument = { nodes: [node('n1', 'Fix login bug')], edges: [] }
    render(<WorkflowGraph graph={graph} />)

    await user.type(screen.getByPlaceholderText('Search nodes…'), 'zzz-nonexistent')

    expect(await screen.findByText(/No nodes match "zzz-nonexistent"/)).toBeInTheDocument()
  })

  // Canvas nodes are rendered by @xyflow/react with onlyRenderVisibleElements,
  // which culls anything outside the computed viewport — jsdom never produces
  // real layout dimensions, so canvas nodes never reach the DOM here (confirmed:
  // mocking getBoundingClientRect alone doesn't fix it, since visibility is
  // driven by React Flow's internal store, not just element geometry). The
  // Hierarchy Tree panel has the same problem (@tanstack/react-virtual also
  // needs real container dimensions). NodeTable is a plain HTML <table> with no
  // virtualization or canvas dependency — selecting a row there exercises the
  // exact same setSelectedNode → NodeDetailDrawer path with real DOM coverage.
  // True canvas/tree-click coverage needs a real browser (Playwright), not RTL/jsdom.
  it('selecting a node row in the Table view opens the NodeDetailDrawer for that node', async () => {
    const user = userEvent.setup()
    const graph: GraphDocument = { nodes: [node('n1', 'Fix login bug')], edges: [] }
    render(<WorkflowGraph graph={graph} />)

    await user.click(screen.getByRole('button', { name: 'Table' }))
    await user.click(await screen.findByText('Fix login bug'))

    // NodeDetailDrawer renders the node's title again inside the drawer once selected.
    expect(await screen.findAllByText('Fix login bug')).toHaveLength(2)
  })

  it('does not throw when an edge references a nonexistent node id (malformed data)', () => {
    const graph: GraphDocument = {
      nodes: [node('n1', 'Only node')],
      edges: [{ id: 'e1', from: 'n1', to: 'ghost-node-id', relationType: 'depends_on', createdAt: '' }],
    }
    expect(() => render(<WorkflowGraph graph={graph} />)).not.toThrow()
  })
})
