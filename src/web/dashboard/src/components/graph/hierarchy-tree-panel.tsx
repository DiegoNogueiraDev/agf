/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { memo, useState, useCallback, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { HierarchyTreeNode } from '@/lib/graph-hierarchy'
import { STATUS_COLORS, NODE_TYPE_COLORS } from '@/lib/constants'

interface FlatTreeItem {
  node: HierarchyTreeNode['node']
  depth: number
  hasChildren: boolean
  childCount: number
}

function flattenTree(tree: HierarchyTreeNode[], expandedIds: Set<string>, depth = 0): FlatTreeItem[] {
  const result: FlatTreeItem[] = []
  for (const item of tree) {
    result.push({
      node: item.node,
      depth,
      hasChildren: item.children.length > 0,
      childCount: item.children.length,
    })
    if (item.children.length > 0 && expandedIds.has(item.node.id)) {
      result.push(...flattenTree(item.children, expandedIds, depth + 1))
    }
  }
  return result
}

interface HierarchyTreePanelProps {
  tree: HierarchyTreeNode[]
  expandedIds: Set<string>
  selectedNodeId: string | null
  onToggleExpand: (nodeId: string) => void
  onSelectNode: (nodeId: string) => void
}

export const HierarchyTreePanel = memo(function HierarchyTreePanel({
  tree,
  expandedIds,
  selectedNodeId,
  onToggleExpand,
  onSelectNode,
}: HierarchyTreePanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  const togglePanel = useCallback(() => setCollapsed((c) => !c), [])

  if (collapsed) {
    return (
      <div className="w-8 border-r border-edge bg-surface-alt flex flex-col items-center pt-2">
        <button onClick={togglePanel} className="text-xs text-muted hover:text-foreground p-1" title="Show tree panel">
          ▸
        </button>
      </div>
    )
  }

  return (
    <div className="w-64 border-r border-edge bg-surface-alt flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-edge">
        <span className="text-xs font-medium text-muted">Hierarchy</span>
        <button onClick={togglePanel} className="text-xs text-muted hover:text-foreground" title="Collapse panel">
          ◂
        </button>
      </div>
      <VirtualizedTree
        tree={tree}
        expandedIds={expandedIds}
        selectedNodeId={selectedNodeId}
        onToggleExpand={onToggleExpand}
        onSelectNode={onSelectNode}
      />
    </div>
  )
})

const ITEM_HEIGHT = 28

function VirtualizedTree({
  tree,
  expandedIds,
  selectedNodeId,
  onToggleExpand,
  onSelectNode,
}: Omit<HierarchyTreePanelProps, never>): React.JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null)

  const flatItems = useMemo(() => flattenTree(tree, expandedIds), [tree, expandedIds])

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 10,
  })

  if (flatItems.length === 0) {
    return <div className="px-3 py-4 text-xs text-muted text-center">No nodes</div>
  }

  return (
    <div ref={parentRef} className="overflow-y-auto flex-1 py-1">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = flatItems[virtualRow.index]
          const isExpanded = expandedIds.has(item.node.id)
          const isSelected = selectedNodeId === item.node.id
          const statusColor = STATUS_COLORS[item.node.status] || '#9e9e9e'
          const typeColor = NODE_TYPE_COLORS[item.node.type] || '#6c757d'

          return (
            <button
              key={item.node.id}
              onClick={() => onSelectNode(item.node.id)}
              className={`absolute top-0 left-0 w-full text-left flex items-center gap-1 px-2 text-xs hover:bg-surface-elevated transition-colors ${
                isSelected ? 'bg-surface-elevated font-semibold' : ''
              }`}
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                paddingLeft: `${item.depth * 16 + 8}px`,
              }}
            >
              {item.hasChildren ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleExpand(item.node.id)
                  }}
                  className="w-4 text-center text-muted hover:text-foreground cursor-pointer shrink-0"
                >
                  {isExpanded ? '\u25BE' : '\u25B8'}
                </span>
              ) : (
                <span className="w-4 shrink-0" />
              )}

              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: statusColor }}
                title={item.node.status.replace('_', ' ')}
              />

              <span
                className="text-[9px] px-1 rounded shrink-0"
                style={{ background: `${typeColor}20`, color: typeColor }}
              >
                {item.node.type.slice(0, 3)}
              </span>

              <span className="truncate">{item.node.title}</span>

              {item.hasChildren && <span className="text-[9px] text-muted ml-auto shrink-0">{item.childCount}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
