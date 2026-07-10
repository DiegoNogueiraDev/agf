/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { WorkflowNodeData } from './graph-utils'
import { NODE_TYPE_COLORS, STATUS_COLORS } from '@/lib/constants'

type WorkflowNodeProps = NodeProps & { data: WorkflowNodeData }

export const WorkflowNode = memo(function WorkflowNode({ data }: WorkflowNodeProps) {
  const typeColor = NODE_TYPE_COLORS[data.nodeType] || '#6c757d'
  const statusColor = STATUS_COLORS[data.status] || '#9e9e9e'

  const handleExpandClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      data.onExpand?.(data.sourceNode.id)
    },
    [data],
  )

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2" />
      <div className="bg-surface border border-edge rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer min-w-[200px]">
        <div className="p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
              style={{ background: `${typeColor}20`, color: typeColor }}
            >
              {data.nodeType}
            </span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: `${statusColor}20`, color: statusColor }}
            >
              {data.status.replace('_', ' ')}
            </span>
          </div>
          <div className="text-sm font-medium leading-tight line-clamp-2 mb-1">{data.label}</div>
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <span>P{data.priority}</span>
            {data.xpSize && <span>{data.xpSize}</span>}
            {data.sprint && <span>{data.sprint}</span>}
          </div>
        </div>
        {data.hasChildren && (
          <button
            onClick={handleExpandClick}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border-t border-edge text-muted hover:text-foreground hover:bg-surface-elevated transition-colors rounded-b-lg"
            title={data.isExpanded ? 'Collapse children' : 'Expand children'}
          >
            <span>{data.isExpanded ? '\u25BC' : '\u25B6'}</span>
            <span>
              {data.childCount} {data.childCount === 1 ? 'child' : 'children'}
            </span>
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" />
    </>
  )
})
