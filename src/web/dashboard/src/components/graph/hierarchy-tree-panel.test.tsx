/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HierarchyTreePanel } from './hierarchy-tree-panel'
import type { HierarchyTreeNode } from '@/lib/graph-hierarchy'
import type { GraphNode } from '@/lib/types'

// jsdom has no ResizeObserver / real layout, so the real virtualizer measures a
// zero-height viewport and renders no virtual items. Replace it with a deterministic
// stub that renders every item — the tree-flattening/click-handling logic is what's
// under test here, not @tanstack/react-virtual's windowing math.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => opts.count * opts.estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, index) => ({
        index,
        start: index * opts.estimateSize(),
        size: opts.estimateSize(),
        key: index,
      })),
  }),
}))

function buildNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'node_1',
    type: 'task',
    title: 'Parent task',
    status: 'backlog',
    priority: 3,
    ...overrides,
  }
}

describe('HierarchyTreePanel', () => {
  it('shows "No nodes" when the tree is empty', () => {
    render(
      <HierarchyTreePanel
        tree={[]}
        expandedIds={new Set()}
        selectedNodeId={null}
        onToggleExpand={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    )

    expect(screen.getByText('No nodes')).toBeInTheDocument()
  })

  it('calls onToggleExpand and not onSelectNode when the expand toggle of a node with children is clicked', async () => {
    const user = userEvent.setup()
    const onToggleExpand = vi.fn()
    const onSelectNode = vi.fn()
    const child = buildNode({ id: 'node_2', title: 'Child task' })
    const tree: HierarchyTreeNode[] = [{ node: buildNode(), children: [{ node: child, children: [] }] }]

    render(
      <HierarchyTreePanel
        tree={tree}
        expandedIds={new Set()}
        selectedNodeId={null}
        onToggleExpand={onToggleExpand}
        onSelectNode={onSelectNode}
      />,
    )

    await user.click(screen.getByText('▸'))

    expect(onToggleExpand).toHaveBeenCalledWith('node_1')
    expect(onSelectNode).not.toHaveBeenCalled()
  })

  it('calls onSelectNode with the correct id when a row is clicked', async () => {
    const user = userEvent.setup()
    const onSelectNode = vi.fn()
    const tree: HierarchyTreeNode[] = [{ node: buildNode(), children: [] }]

    render(
      <HierarchyTreePanel
        tree={tree}
        expandedIds={new Set()}
        selectedNodeId={null}
        onToggleExpand={vi.fn()}
        onSelectNode={onSelectNode}
      />,
    )

    await user.click(screen.getByText('Parent task'))

    expect(onSelectNode).toHaveBeenCalledWith('node_1')
  })
})
