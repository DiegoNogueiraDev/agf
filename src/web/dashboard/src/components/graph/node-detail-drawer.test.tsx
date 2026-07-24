/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NodeDetailDrawer } from './node-detail-drawer'
import type { GraphNode } from '@/lib/types'

vi.mock('./node-detail-panel', () => ({
  NodeDetailPanel: ({ node }: { node: GraphNode }) => <div data-testid="panel">{node.title}</div>,
}))

const mockNode: GraphNode = {
  id: 'node_1',
  type: 'task',
  title: 'Sample task',
  status: 'in_progress',
  priority: 3,
}

describe('NodeDetailDrawer', () => {
  it('renders nothing when node is null', () => {
    const { container } = render(<NodeDetailDrawer node={null} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(<NodeDetailDrawer node={mockNode} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the overlay is clicked', () => {
    const onClose = vi.fn()
    render(<NodeDetailDrawer node={mockNode} onClose={onClose} />)
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders the NodeDetailPanel with the given node when node is present', () => {
    render(<NodeDetailDrawer node={mockNode} onClose={vi.fn()} />)
    expect(screen.getByTestId('panel')).toHaveTextContent('Sample task')
  })
})
