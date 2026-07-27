/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import type { WorkflowEdgeData } from './graph-utils'
import { EDGE_STYLES } from '@/lib/constants'
import type { RelationType } from '@/lib/types'

type WorkflowEdgeProps = EdgeProps & { data?: WorkflowEdgeData }

export const WorkflowEdge = memo(function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
}: WorkflowEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const relType = (data?.relationType || 'related_to') as RelationType
  const edgeStyle = EDGE_STYLES[relType] || EDGE_STYLES.related_to

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: edgeStyle.color,
          strokeDasharray: edgeStyle.dashed ? '5 5' : undefined,
          strokeWidth: 1.5,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="text-[9px] text-muted bg-surface px-1 rounded pointer-events-none absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
        >
          {edgeStyle.label}
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
