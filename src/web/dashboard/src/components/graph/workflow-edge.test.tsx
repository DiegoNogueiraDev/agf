/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ReactFlowProvider, Position, type EdgeProps } from '@xyflow/react'
import { WorkflowEdge } from './workflow-edge'
import type { WorkflowEdgeData } from './graph-utils'

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react')
  return {
    ...actual,
    // EdgeLabelRenderer normally portals into a DOM node only <ReactFlow> creates;
    // render children inline so the label is assertable without a full flow instance.
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => children,
  }
})

function buildProps(data?: WorkflowEdgeData): EdgeProps & { data?: WorkflowEdgeData } {
  return {
    id: 'edge_1',
    source: 'node_1',
    target: 'node_2',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data,
  } as unknown as EdgeProps & { data?: WorkflowEdgeData }
}

function renderEdge(props: EdgeProps & { data?: WorkflowEdgeData }) {
  return render(
    <ReactFlowProvider>
      <svg>
        <WorkflowEdge {...props} />
      </svg>
    </ReactFlowProvider>,
  )
}

describe('WorkflowEdge', () => {
  it('falls back to related_to without throwing when relationType is unmapped', () => {
    const { container } = renderEdge(buildProps({ relationType: 'unknown_type' as WorkflowEdgeData['relationType'] }))
    expect(container.querySelector('.react-flow__edge-path')).toHaveStyle({ strokeDasharray: '5 5' })
    expect(container).toHaveTextContent('related to')
  })

  it('sets strokeDasharray when the relation style is dashed', () => {
    const { container } = renderEdge(buildProps({ relationType: 'blocks' }))
    expect(container.querySelector('.react-flow__edge-path')).toHaveStyle({ strokeDasharray: '5 5' })
  })

  it('does not set strokeDasharray when the relation style is not dashed', () => {
    const { container } = renderEdge(buildProps({ relationType: 'depends_on' }))
    const path = container.querySelector('.react-flow__edge-path') as SVGPathElement
    expect(path.style.strokeDasharray).toBe('')
  })

  it('renders the label via EdgeLabelRenderer for a valid relationType', () => {
    const { container } = renderEdge(buildProps({ relationType: 'implements' }))
    expect(container).toHaveTextContent('implements')
  })
})
