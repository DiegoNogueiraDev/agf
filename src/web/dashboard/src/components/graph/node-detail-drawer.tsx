/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { useEffect, useCallback } from 'react'
import { NodeDetailPanel } from './node-detail-panel'
import type { GraphNode, GraphEdge } from '@/lib/types'

interface NodeDetailDrawerProps {
  node: GraphNode | null
  edges?: GraphEdge[]
  allNodes?: GraphNode[]
  childrenMap?: Map<string, string[]>
  onClose: () => void
  onNodeNavigate?: (nodeId: string) => void
}

/**
 * Side drawer wrapper for NodeDetailPanel.
 * Provides overlay, slide-in animation (200ms), Escape key, and mobile full-width.
 */
export function NodeDetailDrawer({
  node,
  edges,
  allNodes,
  childrenMap,
  onClose,
  onNodeNavigate,
}: NodeDetailDrawerProps): React.JSX.Element | null {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!node) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [node, handleKeyDown])

  if (!node) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity duration-200"
        onClick={onClose}
        role="presentation"
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-50 w-full sm:w-[480px] animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-label="Node details"
      >
        <NodeDetailPanel
          node={node}
          edges={edges}
          allNodes={allNodes}
          childrenMap={childrenMap}
          onClose={onClose}
          onNodeNavigate={onNodeNavigate}
        />
      </div>
    </>
  )
}
