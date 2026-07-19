/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { memo, useMemo } from 'react'
import type { GraphNode, GraphEdge } from '@/lib/types'
import { STATUS_COLORS, NODE_TYPE_COLORS, EDGE_STYLES } from '@/lib/constants'
import { getNodeEdgeSummary } from '@/lib/graph-filters'

interface NodeDetailPanelProps {
  node: GraphNode | null
  edges?: GraphEdge[]
  allNodes?: GraphNode[]
  childrenMap?: Map<string, string[]>
  onClose: () => void
  onNodeNavigate?: (nodeId: string) => void
}

export const NodeDetailPanel = memo(function NodeDetailPanel({
  node,
  edges = [],
  allNodes = [],
  childrenMap,
  onClose,
  onNodeNavigate,
}: NodeDetailPanelProps) {
  if (!node) return null

  const typeColor = NODE_TYPE_COLORS[node.type] || '#6c757d'
  const statusColor = STATUS_COLORS[node.status] || '#9e9e9e'

  const edgeSummary = useMemo(() => getNodeEdgeSummary(node.id, edges), [node.id, edges])

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>()
    for (const n of allNodes) map.set(n.id, n)
    return map
  }, [allNodes])

  const hasRelationships = edgeSummary.outgoing.length > 0 || edgeSummary.incoming.length > 0

  return (
    <div className="w-full h-full border-l border-edge bg-surface-alt overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">Node Details</h3>
        <button onClick={onClose} className="text-muted hover:text-foreground text-lg leading-none">
          &times;
        </button>
      </div>

      <h4 className="text-base font-semibold mb-3">{node.title}</h4>

      <div className="space-y-2 text-sm">
        <Row label="ID">
          <code className="text-xs bg-surface-elevated px-1 rounded break-all">{node.id}</code>
        </Row>
        <Row label="Type">
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ background: `${typeColor}20`, color: typeColor }}
          >
            {node.type}
          </span>
        </Row>
        <Row label="Status">
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: `${statusColor}20`, color: statusColor }}
          >
            {node.status.replace('_', ' ')}
          </span>
        </Row>
        <Row label="Priority">P{node.priority}</Row>
        {node.xpSize && <Row label="Size">{node.xpSize}</Row>}
        {node.estimateMinutes != null && <Row label="Estimate">{node.estimateMinutes}min</Row>}
        {node.sprint && <Row label="Sprint">{node.sprint}</Row>}

        {node.description && (
          <div className="pt-2 border-t border-edge">
            <div className="text-xs font-medium text-muted mb-1">Description</div>
            <p className="text-xs whitespace-pre-wrap">{node.description}</p>
          </div>
        )}

        {childrenMap &&
          (() => {
            const childIds = childrenMap.get(node.id) ?? []
            if (childIds.length === 0) return null
            return (
              <div className="pt-2 border-t border-edge">
                <div className="text-xs font-medium text-muted mb-1">Children ({childIds.length})</div>
                <div className="space-y-1">
                  {childIds.map((childId) => {
                    const child = nodeMap.get(childId)
                    if (!child) return null
                    const childStatusColor = STATUS_COLORS[child.status] || '#9e9e9e'
                    const childTypeColor = NODE_TYPE_COLORS[child.type] || '#6c757d'
                    return (
                      <button
                        key={childId}
                        onClick={() => onNodeNavigate?.(childId)}
                        className="w-full text-left flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-surface-elevated transition-colors text-xs"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: childStatusColor }} />
                        <span
                          className="text-[9px] px-1 rounded shrink-0"
                          style={{ background: `${childTypeColor}20`, color: childTypeColor }}
                        >
                          {child.type}
                        </span>
                        <span className="truncate font-medium">{child.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

        {hasRelationships && (
          <div className="pt-2 border-t border-edge">
            <div className="text-xs font-medium text-muted mb-1">
              Relationships ({edgeSummary.outgoing.length + edgeSummary.incoming.length})
            </div>
            <div className="space-y-1">
              {edgeSummary.outgoing.map((edge) => {
                const target = nodeMap.get(edge.to)
                const style = EDGE_STYLES[edge.relationType] || EDGE_STYLES.related_to
                return (
                  <EdgeItem
                    key={edge.id}
                    direction="out"
                    label={style.label}
                    color={style.color}
                    targetTitle={target?.title ?? edge.to}
                    targetStatus={target?.status}
                    targetId={edge.to}
                    onNavigate={onNodeNavigate}
                  />
                )
              })}
              {edgeSummary.incoming.map((edge) => {
                const source = nodeMap.get(edge.from)
                const style = EDGE_STYLES[edge.relationType] || EDGE_STYLES.related_to
                return (
                  <EdgeItem
                    key={edge.id}
                    direction="in"
                    label={style.label}
                    color={style.color}
                    targetTitle={source?.title ?? edge.from}
                    targetStatus={source?.status}
                    targetId={edge.from}
                    onNavigate={onNodeNavigate}
                  />
                )
              })}
            </div>
          </div>
        )}

        {node.acceptanceCriteria && node.acceptanceCriteria.length > 0 && (
          <div className="pt-2 border-t border-edge">
            <div className="text-xs font-medium text-muted mb-1">
              Acceptance Criteria ({node.acceptanceCriteria.length})
            </div>
            <ul className="text-xs space-y-1 list-disc pl-4">
              {node.acceptanceCriteria.map((ac, i) => (
                <li key={i}>{ac}</li>
              ))}
            </ul>
          </div>
        )}

        {node.tags && node.tags.length > 0 && (
          <div className="pt-2 border-t border-edge">
            <div className="text-xs font-medium text-muted mb-1">Tags</div>
            <div className="flex flex-wrap gap-1">
              {node.tags.map((tag) => (
                <span key={tag} className="text-[10px] bg-surface-elevated px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {node.sourceRef && (
          <div className="pt-2 border-t border-edge">
            <div className="text-xs font-medium text-muted mb-1">Source</div>
            <div className="text-xs">
              {node.sourceRef.file}
              {node.sourceRef.startLine != null && ` (L${node.sourceRef.startLine}–${node.sourceRef.endLine ?? '?'})`}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-edge text-[10px] text-muted">
          <div>Created: {new Date(node.createdAt).toLocaleString()}</div>
          <div>Updated: {new Date(node.updatedAt).toLocaleString()}</div>
        </div>
      </div>
    </div>
  )
})

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted shrink-0">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}

function EdgeItem({
  direction,
  label,
  color,
  targetTitle,
  targetStatus,
  targetId,
  onNavigate,
}: {
  direction: 'in' | 'out'
  label: string
  color: string
  targetTitle: string
  targetStatus?: string
  targetId: string
  onNavigate?: (id: string) => void
}): React.JSX.Element {
  const arrow = direction === 'out' ? '\u2192' : '\u2190'
  const statusColor = targetStatus
    ? (STATUS_COLORS[targetStatus as keyof typeof STATUS_COLORS] ?? '#9e9e9e')
    : undefined
  return (
    <button
      onClick={() => onNavigate?.(targetId)}
      className="w-full text-left flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-surface-elevated transition-colors text-xs cursor-pointer"
    >
      <span style={{ color }}>{arrow}</span>
      <span className="text-[10px] text-muted shrink-0">{label}</span>
      <span className="truncate font-medium">{targetTitle}</span>
      {statusColor && (
        <span
          className="ml-auto shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-medium"
          style={{ background: `${statusColor}20`, color: statusColor }}
        >
          {(targetStatus ?? '').replace('_', ' ')}
        </span>
      )}
    </button>
  )
}
