/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { useRef } from 'react'
import { Loader2, FileUp, AlertCircle, LayoutGrid } from 'lucide-react'
import type { GraphDocument } from '@/lib/types'
import type { GraphValidationState } from '@/hooks/use-graph-data'
import { WorkflowGraph } from '@/components/graph/workflow-graph'
import { FullscreenButton } from '../ui/fullscreen-button'
import { FullscreenOverlay } from '../ui/fullscreen-overlay'
import { useFullscreen } from '@/hooks/use-fullscreen'

interface GraphTabProps {
  graph: GraphDocument | null
  loading?: boolean
  error?: string | null
  validation?: GraphValidationState
  onRetry?: () => void
  onImportPrd?: () => void
}

function GraphSkeleton(): React.JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
        <Loader2 className="w-8 h-8 text-accent animate-spin relative" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Loading graph...</p>
        <p className="text-[10px] text-muted mt-1">Computing layout and rendering nodes</p>
      </div>
    </div>
  )
}

function GraphError({ message, onRetry }: { message: string; onRetry?: () => void }): React.JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <AlertCircle className="w-10 h-10 text-red-400" />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Failed to load graph</p>
        <p className="text-xs text-muted mt-1 max-w-md">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md border border-edge text-muted hover:text-foreground hover:border-accent/50 transition-colors cursor-pointer"
        >
          <Loader2 className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  )
}

function GraphEmpty({ onImportPrd }: { onImportPrd?: () => void }): React.JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <LayoutGrid className="w-12 h-12 text-muted/30" />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">No nodes in the graph</p>
        <p className="text-xs text-muted mt-1">Import a PRD or add nodes to get started</p>
      </div>
      {onImportPrd && (
        <button
          onClick={onImportPrd}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 transition-opacity cursor-pointer"
        >
          <FileUp className="w-3.5 h-3.5" />
          Import PRD
        </button>
      )}
    </div>
  )
}

/** GraphTab — auto-generated description placeholder. */
export function GraphTab({
  graph,
  loading,
  error,
  validation,
  onRetry,
  onImportPrd,
}: GraphTabProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const { isFullscreen, toggleFullscreen, exitFullscreen } = useFullscreen()

  if (loading && !graph) {
    return <GraphSkeleton />
  }

  if (error && !graph) {
    return <GraphError message={error} onRetry={onRetry} />
  }

  if (!graph || (graph.nodes.length === 0 && graph.edges.length === 0)) {
    return <GraphEmpty onImportPrd={onImportPrd} />
  }

  const showValidationBanner = validation && (validation.repairImpossible || validation.warnings.length > 0)

  return (
    <div ref={containerRef} className="relative h-full flex flex-col">
      {showValidationBanner && (
        <div
          role="alert"
          aria-label="Graph validation warnings"
          className={`flex-shrink-0 px-3 py-2 text-xs border-b ${
            validation.repairImpossible
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400'
          }`}
        >
          {validation.repairImpossible ? (
            <>
              <span className="font-semibold">Graph payload has unrepaired fields: </span>
              {validation.fatalFields.join(', ')}
            </>
          ) : (
            <>
              <span className="font-semibold">Auto-fixed {validation.warnings.length} field(s): </span>
              {validation.warnings.slice(0, 3).join('; ')}
              {validation.warnings.length > 3 && ` (+${validation.warnings.length - 3} more)`}
            </>
          )}
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        <div className="absolute top-2 right-2 z-10">
          <FullscreenButton
            containerRef={containerRef}
            tabName="Graph"
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
          />
        </div>
        <FullscreenOverlay tabName="Graph" isFullscreen={isFullscreen} exitFullscreen={exitFullscreen} />
        <WorkflowGraph graph={graph} />
      </div>
    </div>
  )
}
