/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeTable } from './node-table'
import type { GraphNode } from '@/lib/types'

function buildNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'node_1',
    type: 'task',
    title: 'Sample task',
    status: 'backlog',
    priority: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

afterEach(() => {
  window.localStorage.clear()
})

describe('NodeTable', () => {
  it('filters to only matching nodes for a faceted search query', async () => {
    const user = userEvent.setup()
    const nodes = [
      buildNode({ id: 'node_1', title: 'Alpha', status: 'done' }),
      buildNode({ id: 'node_2', title: 'Beta', status: 'backlog' }),
    ]
    render(<NodeTable nodes={nodes} onNodeClick={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/search/i), 'status:done')

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument()
      expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    })
  })

  it('reverses sort direction when a column header is clicked twice', async () => {
    const user = userEvent.setup()
    const nodes = [buildNode({ id: 'node_1', title: 'Bravo' }), buildNode({ id: 'node_2', title: 'Alpha' })]
    render(<NodeTable nodes={nodes} onNodeClick={vi.fn()} />)

    const titleHeader = screen.getByRole('columnheader', { name: /title/i })
    const rowTitles = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent)

    await user.click(titleHeader)
    const ascOrder = rowTitles()
    expect(ascOrder[0]).toContain('Alpha')

    await user.click(titleHeader)
    const descOrder = rowTitles()
    expect(descOrder[0]).toContain('Bravo')
  })

  it('shows "No nodes found" when nodes is empty', () => {
    render(<NodeTable nodes={[]} onNodeClick={vi.fn()} />)

    expect(screen.getByText('No nodes found')).toBeInTheDocument()
  })
})
