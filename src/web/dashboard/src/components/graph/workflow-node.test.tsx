/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { WorkflowNode } from './workflow-node'
import type { WorkflowNodeData } from './graph-utils'
import type { GraphNode } from '@/lib/types'

const mockSourceNode: GraphNode = {
  id: 'node_1',
  type: 'task',
  title: 'Sample task',
  status: 'in_progress',
  priority: 3,
}

function buildProps(overrides: Partial<WorkflowNodeData> = {}): NodeProps & { data: WorkflowNodeData } {
  const data: WorkflowNodeData = {
    label: 'Sample task',
    nodeType: 'task',
    status: 'in_progress',
    priority: 3,
    sourceNode: mockSourceNode,
    hasChildren: false,
    isExpanded: false,
    childCount: 0,
    ...overrides,
  }
  return {
    id: 'node_1',
    type: 'workflowNode',
    data,
    selected: false,
    zIndex: 0,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    dragging: false,
  } as unknown as NodeProps & { data: WorkflowNodeData }
}

function renderNode(props: NodeProps & { data: WorkflowNodeData }) {
  return render(
    <ReactFlowProvider>
      <WorkflowNode {...props} />
    </ReactFlowProvider>,
  )
}

describe('WorkflowNode', () => {
  it('does not render the expand button when hasChildren is false', () => {
    renderNode(buildProps({ hasChildren: false }))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('calls data.onExpand with the source node id and stops propagation when the expand button is clicked', async () => {
    const user = userEvent.setup()
    const onExpand = vi.fn()
    const onNodeClick = vi.fn()
    renderNode(buildProps({ hasChildren: true, isExpanded: false, childCount: 2, onExpand }))
    document.addEventListener('click', onNodeClick)

    await user.click(screen.getByRole('button'))

    expect(onExpand).toHaveBeenCalledWith('node_1')
    expect(onNodeClick).not.toHaveBeenCalled()
  })

  it('shows the expanded-state icon when isExpanded is true', () => {
    renderNode(buildProps({ hasChildren: true, isExpanded: true, childCount: 1 }))
    expect(screen.getByRole('button')).toHaveTextContent('▼')
  })

  it('shows the collapsed-state icon when isExpanded is false', () => {
    renderNode(buildProps({ hasChildren: true, isExpanded: false, childCount: 1 }))
    expect(screen.getByRole('button')).toHaveTextContent('▶')
  })

  it('does not throw when the expand button is clicked and onExpand is undefined', async () => {
    const user = userEvent.setup()
    renderNode(buildProps({ hasChildren: true, isExpanded: false, childCount: 1, onExpand: undefined }))

    await expect(user.click(screen.getByRole('button'))).resolves.not.toThrow()
  })
})
