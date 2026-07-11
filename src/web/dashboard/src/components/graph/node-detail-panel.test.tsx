/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeDetailPanel } from './node-detail-panel'
import type { GraphNode, GraphEdge } from '@/lib/types'

function buildNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'node_1',
    type: 'task',
    title: 'Sample task',
    status: 'in_progress',
    priority: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('NodeDetailPanel', () => {
  it('renders nothing when node is null', () => {
    const { container } = render(<NodeDetailPanel node={null} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the Acceptance Criteria and Tags sections when populated', () => {
    const node = buildNode({
      acceptanceCriteria: ['Given X, When Y, Then Z'],
      tags: ['should', 'rtl'],
    })
    render(<NodeDetailPanel node={node} onClose={vi.fn()} />)

    expect(screen.getByText('Acceptance Criteria (1)')).toBeInTheDocument()
    expect(screen.getByText('Given X, When Y, Then Z')).toBeInTheDocument()
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('should')).toBeInTheDocument()
    expect(screen.getByText('rtl')).toBeInTheDocument()
  })

  it('calls onNodeNavigate with the target node id when a relationship row is clicked', async () => {
    const user = userEvent.setup()
    const onNodeNavigate = vi.fn()
    const node = buildNode({ id: 'node_1' })
    const target = buildNode({ id: 'node_2', title: 'Target node' })
    const edges: GraphEdge[] = [
      { id: 'edge_1', from: 'node_1', to: 'node_2', relationType: 'depends_on', createdAt: '2026-01-01T00:00:00.000Z' },
    ]

    render(
      <NodeDetailPanel
        node={node}
        edges={edges}
        allNodes={[node, target]}
        onClose={vi.fn()}
        onNodeNavigate={onNodeNavigate}
      />,
    )

    await user.click(screen.getByText('Target node'))

    expect(onNodeNavigate).toHaveBeenCalledWith('node_2')
  })
})
