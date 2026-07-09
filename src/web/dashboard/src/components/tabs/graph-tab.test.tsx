/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GraphTab } from './graph-tab'
import type { GraphDocument } from '@/lib/types'

vi.mock('@/components/graph/workflow-graph', () => ({
  WorkflowGraph: () => <div data-testid="workflow-graph" />,
}))

const nonEmptyGraph: GraphDocument = {
  nodes: [{ id: 'n1', title: 'Node 1', type: 'task', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' }],
  edges: [],
}

describe('GraphTab', () => {
  it('shows the loading skeleton when loading is true and graph is null', () => {
    render(<GraphTab graph={null} loading />)

    expect(screen.getByText('Loading graph...')).toBeInTheDocument()
  })

  it('shows the error message and calls onRetry when Retry is clicked, given error and no graph', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<GraphTab graph={null} error="network down" onRetry={onRetry} />)

    expect(screen.getByText('Failed to load graph')).toBeInTheDocument()
    expect(screen.getByText('network down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the red banner listing fatalFields when validation.repairImpossible is true', () => {
    render(
      <GraphTab
        graph={nonEmptyGraph}
        validation={{ warnings: [], fatalFields: ['nodes[0].status'], repairImpossible: true }}
      />,
    )

    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent('unrepaired fields')
    expect(banner).toHaveTextContent('nodes[0].status')
  })
})
