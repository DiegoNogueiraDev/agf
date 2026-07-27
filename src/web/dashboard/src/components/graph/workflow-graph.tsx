/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { useState, useCallback, useMemo, useEffect, useDeferredValue, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { SlidersHorizontal, ListTree, Table2, ChevronsDownUp, ChevronsUpDown, Network, Search, X } from 'lucide-react'

import type { GraphDocument, GraphNode, NodeStatus, NodeType } from '@/lib/types'
import { buildChildrenMap, getVisibleNodes, buildHierarchyTree } from '@/lib/graph-hierarchy'
import { WorkflowNode } from './workflow-node'
import { WorkflowEdge } from './workflow-edge'
import { FilterPanel } from './filter-panel'
import { HierarchyTreePanel } from './hierarchy-tree-panel'
import { NodeDetailDrawer } from './node-detail-drawer'
import { NodeTable } from './node-table'
import { EdgeCreateDialog } from './edge-create-dialog'
import {
  toFlowNodes,
  toFlowEdges,
  applyDagreLayout,
  applyElkLayout,
  applyGridLayout,
  shouldSkipLayout,
  type WorkflowNodeData,
  type WorkflowEdgeData,
  type LayoutEngine,
} from './graph-utils'

const nodeTypes = { workflowNode: WorkflowNode }
const edgeTypes = { workflowEdge: WorkflowEdge }
const proOptions = { hideAttribution: true }
// Default canvas caps to this many root nodes so a 3k-node graph opens clean and
// readable instead of as a hairball. Filters/Search/Tree/Expand reveal the rest.
const CANVAS_ROOT_CAP = 40
// Search mode renders all matches up to this many (bypasses the root cap).
const SEARCH_CAP = 80
const fitViewOptions = { maxZoom: 1, padding: 0.25 }

interface WorkflowGraphProps {
  graph: GraphDocument
}

interface PendingConnection {
  fromId: string
  toId: string
}

/** WorkflowGraph — auto-generated description placeholder. */
export function WorkflowGraph({ graph }: WorkflowGraphProps): React.JSX.Element {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<WorkflowEdgeData>>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [direction, setDirection] = useState<'TB' | 'LR'>('TB')
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set())
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set())
  const [filterSprints, setFilterSprints] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null)
  const [layoutEngine, setLayoutEngine] = useState<LayoutEngine>('dagre')
  // Panels collapsed by default → the canvas is the dominant, clean surface.
  const [showFilters, setShowFilters] = useState(false)
  const [showHierarchy, setShowHierarchy] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [search, setSearch] = useState('')

  // Defer filter values so checkbox updates are visually immediate
  const deferredStatuses = useDeferredValue(filterStatuses)
  const deferredTypes = useDeferredValue(filterTypes)
  const deferredSprints = useDeferredValue(filterSprints)
  const deferredDirection = useDeferredValue(direction)
  const deferredSearch = useDeferredValue(search)

  // Track previous layout node IDs to skip redundant Dagre runs
  const prevLayoutIdsRef = useRef<string[] | null>(null)

  // Compute children map once per graph change
  const childrenMap = useMemo(() => buildChildrenMap(graph.nodes, graph.edges), [graph.nodes, graph.edges])

  // Hierarchy tree for sidebar
  const hierarchyTree = useMemo(() => buildHierarchyTree(graph.nodes, childrenMap), [graph.nodes, childrenMap])

  // Meaningful roots for the clean default canvas: epics + any root that has
  // children, priority-first. The raw graph has hundreds of orphan roots which
  // make a flat hairball — the default view caps to the top CANVAS_ROOT_CAP and
  // a banner points to Filters/Search/Tree for the rest.
  const meaningfulRoots = useMemo(() => {
    const ids = new Set(graph.nodes.map((n) => n.id))
    return graph.nodes
      .filter(
        (n) => (!n.parentId || !ids.has(n.parentId)) && (n.type === 'epic' || (childrenMap.get(n.id)?.length ?? 0) > 0),
      )
      .sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3))
  }, [graph.nodes, childrenMap])

  const cappedRootIds = useMemo(
    () => new Set(meaningfulRoots.slice(0, CANVAS_ROOT_CAP).map((n) => n.id)),
    [meaningfulRoots],
  )

  // Expand/collapse handlers
  const handleNodeExpand = useCallback((nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const handleExpandAll = useCallback(() => {
    const allParentIds = new Set<string>()
    for (const [parentId] of childrenMap) {
      allParentIds.add(parentId)
    }
    setExpandedIds(allParentIds)
  }, [childrenMap])

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  const applyLayout = useCallback(
    async (
      statuses: Set<string>,
      types: Set<string>,
      sprints: Set<string>,
      dir: 'TB' | 'LR',
      engine: LayoutEngine,
      searchQuery: string,
    ) => {
      const q = searchQuery.trim().toLowerCase()
      const isSearching = q.length > 0
      let visibleGraphNodes: GraphNode[]

      const noFilters = statuses.size === 0 && types.size === 0 && sprints.size === 0
      const isDefaultView = !isSearching && noFilters && expandedIds.size === 0

      if (isSearching) {
        // Search mode: jump to any node by title/id across the whole graph
        // (bypasses the root cap), capped so huge result sets stay readable.
        visibleGraphNodes = graph.nodes
          .filter((n) => n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
          .slice(0, SEARCH_CAP)
      } else {
        visibleGraphNodes = getVisibleNodes(graph.nodes, expandedIds, childrenMap)
        // Clean default view: nothing filtered + nothing expanded → only the
        // capped meaningful roots so a 3k-node graph opens readable, not a hairball.
        if (isDefaultView) {
          visibleGraphNodes = visibleGraphNodes.filter((n) => cappedRootIds.has(n.id))
        } else if (noFilters) {
          const nodeIdSet = new Set(graph.nodes.map((n) => n.id))
          const isRoot = (n: GraphNode): boolean => !n.parentId || !nodeIdSet.has(n.parentId)
          const hasChildren = (n: GraphNode): boolean => (childrenMap.get(n.id)?.length ?? 0) > 0
          visibleGraphNodes = visibleGraphNodes.filter((n) => !isRoot(n) || n.type === 'epic' || hasChildren(n))
        }
      }

      const filters = { statuses, types, sprints }
      const flowNodes = toFlowNodes(visibleGraphNodes, filters, childrenMap, expandedIds, handleNodeExpand)
      const nextIds = flowNodes.map((n) => n.id)

      // Skip layout if visible node IDs haven't changed and same engine+direction
      if (shouldSkipLayout(prevLayoutIdsRef.current, nextIds) && dir === deferredDirection) {
        return
      }
      prevLayoutIdsRef.current = nextIds

      const visibleIds = new Set(nextIds)
      const flowEdges = toFlowEdges(graph.edges, visibleIds)

      // Add CSS transition for smooth repositioning when switching engines
      const withTransition = flowNodes.map((n) => ({
        ...n,
        style: { ...n.style, transition: 'transform 300ms ease' },
      }))

      let layout: { nodes: typeof flowNodes; edges: typeof flowEdges }
      if (isDefaultView || isSearching) {
        // Disconnected cards → tidy grid (dagre/elk would pack them in a row)
        layout = applyGridLayout(withTransition, flowEdges)
      } else if (engine === 'elk') {
        layout = await applyElkLayout(withTransition, flowEdges)
      } else {
        layout = applyDagreLayout(withTransition, flowEdges, dir)
      }
      setNodes(layout.nodes)
      setEdges(layout.edges)
    },
    [graph, setNodes, setEdges, deferredDirection, expandedIds, childrenMap, handleNodeExpand, cappedRootIds],
  )

  useEffect(() => {
    void applyLayout(deferredStatuses, deferredTypes, deferredSprints, deferredDirection, layoutEngine, deferredSearch)
  }, [
    graph,
    applyLayout,
    deferredStatuses,
    deferredTypes,
    deferredSprints,
    deferredDirection,
    layoutEngine,
    deferredSearch,
  ])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node<WorkflowNodeData>) => {
    setSelectedNode(node.data.sourceNode)
  }, [])

  const handleTableNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node)
  }, [])

  const handleNodeNavigate = useCallback(
    (nodeId: string) => {
      const target = graph.nodes.find((n) => n.id === nodeId)
      if (target) setSelectedNode(target)
    },
    [graph.nodes],
  )

  const handleTreeSelectNode = useCallback(
    (nodeId: string) => {
      const target = graph.nodes.find((n) => n.id === nodeId)
      if (target) setSelectedNode(target)
    },
    [graph.nodes],
  )

  const handleConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target && connection.source !== connection.target) {
      setPendingConnection({ fromId: connection.source, toId: connection.target })
    }
  }, [])

  const handleEdgeCreated = useCallback(() => {
    setPendingConnection(null)
    // SSE will trigger a graph refresh automatically
  }, [])

  const toggleStatus = useCallback((status: NodeStatus) => {
    setFilterStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }, [])

  const toggleType = useCallback((type: NodeType) => {
    setFilterTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  const toggleSprint = useCallback((sprint: string) => {
    setFilterSprints((prev) => {
      const next = new Set(prev)
      if (next.has(sprint)) next.delete(sprint)
      else next.add(sprint)
      return next
    })
  }, [])

  const clearFilters = useCallback(() => {
    setFilterStatuses(new Set())
    setFilterTypes(new Set())
    setFilterSprints(new Set())
  }, [])

  // Available sprints for filter dropdown
  const availableSprints = useMemo(() => {
    const sprints = new Set<string>()
    for (const n of graph.nodes) {
      if (n.sprint) sprints.add(n.sprint)
    }
    return [...sprints].sort()
  }, [graph.nodes])

  // Node types actually present in the graph, with counts, most-common first —
  // so the filter shows only useful chips instead of all 16 possible types.
  const availableTypes = useMemo(() => {
    const counts = new Map<NodeType, number>()
    for (const n of graph.nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1)
    return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)
  }, [graph.nodes])

  // Visible nodes for the table (respects expansion + filters)
  const visibleTableNodes = useMemo(() => {
    const visible = getVisibleNodes(graph.nodes, expandedIds, childrenMap)
    return visible.filter((n) => {
      if (filterStatuses.size && !filterStatuses.has(n.status)) return false
      if (filterTypes.size && !filterTypes.has(n.type)) return false
      if (filterSprints.size && !filterSprints.has(n.sprint ?? '')) return false
      return true
    })
  }, [graph.nodes, expandedIds, childrenMap, filterStatuses, filterTypes])

  // Resolve titles for pending connection dialog
  const pendingFromTitle = pendingConnection
    ? graph.nodes.find((n) => n.id === pendingConnection.fromId)?.title
    : undefined
  const pendingToTitle = pendingConnection ? graph.nodes.find((n) => n.id === pendingConnection.toId)?.title : undefined

  const activeFilterCount = filterStatuses.size + filterTypes.size + filterSprints.size
  const searching = search.trim().length > 0
  const searchMatchCount = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return 0
    return graph.nodes.filter((n) => n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)).length
  }, [search, graph.nodes])
  const canvasCapped =
    !searching && activeFilterCount === 0 && expandedIds.size === 0 && meaningfulRoots.length > CANVAS_ROOT_CAP

  const tbtn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors'
  const tbtnIdle = 'border-edge text-muted hover:text-foreground hover:bg-surface-elevated'
  const tbtnActive = 'border-accent/40 bg-accent/15 text-foreground'

  return (
    <div className="flex flex-col h-full">
      {/* Compact modern toolbar — everything else is collapsed by default */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-edge bg-surface-alt flex-wrap">
        {/* Global node search — jump to any node by title/id */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes…"
            aria-label="Search nodes"
            className="w-48 pl-7 pr-7 py-1.5 text-xs bg-surface border border-edge rounded-lg focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {searching && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          className={`${tbtn} ${showFilters || activeFilterCount > 0 ? tbtnActive : tbtnIdle}`}
          onClick={() => setShowFilters((v) => !v)}
          aria-pressed={showFilters}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 rounded-full bg-accent text-white px-1.5 text-[10px] leading-4">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Layout engine — segmented pill */}
        <div className="inline-flex items-center rounded-lg border border-edge overflow-hidden">
          <span className="px-2 text-muted">
            <Network className="w-3.5 h-3.5" />
          </span>
          <button
            className={`px-2.5 py-1.5 text-xs ${layoutEngine === 'dagre' ? 'bg-accent text-white' : 'text-muted hover:bg-surface-elevated'}`}
            onClick={() => setLayoutEngine('dagre')}
            aria-pressed={layoutEngine === 'dagre'}
          >
            Dagre
          </button>
          <button
            className={`px-2.5 py-1.5 text-xs ${layoutEngine === 'elk' ? 'bg-accent text-white' : 'text-muted hover:bg-surface-elevated'}`}
            onClick={() => setLayoutEngine('elk')}
            aria-pressed={layoutEngine === 'elk'}
            title="ELK — recommended for graphs with 100+ nodes"
          >
            ELK
          </button>
        </div>

        <button className={`${tbtn} ${tbtnIdle}`} onClick={handleExpandAll} title="Expand all">
          <ChevronsUpDown className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Expand</span>
        </button>
        <button className={`${tbtn} ${tbtnIdle}`} onClick={handleCollapseAll} title="Collapse all">
          <ChevronsDownUp className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Collapse</span>
        </button>

        <button
          className={`${tbtn} ${showHierarchy ? tbtnActive : tbtnIdle}`}
          onClick={() => setShowHierarchy((v) => !v)}
          aria-pressed={showHierarchy}
          title="Toggle hierarchy panel"
        >
          <ListTree className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Tree</span>
        </button>
        <button
          className={`${tbtn} ${showTable ? tbtnActive : tbtnIdle}`}
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          title="Toggle node table"
        >
          <Table2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Table</span>
        </button>

        <span className="ml-auto text-xs text-muted tabular-nums">
          {visibleTableNodes.length.toLocaleString()} / {graph.nodes.length.toLocaleString()}
        </span>
        {activeFilterCount > 0 && (
          <button className="text-xs text-accent hover:underline px-1" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {/* Collapsible filter chips */}
      {showFilters && (
        <FilterPanel
          statuses={filterStatuses}
          types={filterTypes}
          sprints={filterSprints}
          availableTypes={availableTypes}
          availableSprints={availableSprints}
          direction={direction}
          onStatusToggle={toggleStatus}
          onTypeToggle={toggleType}
          onSprintToggle={toggleSprint}
          onDirectionChange={setDirection}
        />
      )}

      <div className="flex flex-1 min-h-0">
        {showHierarchy && (
          <HierarchyTreePanel
            tree={hierarchyTree}
            expandedIds={expandedIds}
            selectedNodeId={selectedNode?.id ?? null}
            onToggleExpand={handleNodeExpand}
            onSelectNode={handleTreeSelectNode}
          />
        )}

        <div className="flex-1 relative">
          {searching && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-surface-elevated/90 border border-edge text-[11px] text-muted shadow-sm backdrop-blur">
              {searchMatchCount === 0
                ? `No nodes match "${search.trim()}"`
                : `${searchMatchCount.toLocaleString()} match${searchMatchCount === 1 ? '' : 'es'} for "${search.trim()}"${
                    searchMatchCount > SEARCH_CAP ? ` — showing first ${SEARCH_CAP}` : ''
                  }`}
            </div>
          )}
          {canvasCapped && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-surface-elevated/90 border border-edge text-[11px] text-muted shadow-sm backdrop-blur">
              Showing top {CANVAS_ROOT_CAP} of {meaningfulRoots.length.toLocaleString()} root nodes — use{' '}
              <span className="text-foreground">Filters</span>, <span className="text-foreground">Tree</span>, or expand
              a node to see more
            </div>
          )}
          {graph.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted">
              <div className="text-center">
                <p className="text-lg mb-2">No nodes in graph</p>
                <p className="text-sm">Import a PRD to get started</p>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onConnect={handleConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={true}
              onlyRenderVisibleElements
              fitView
              fitViewOptions={fitViewOptions}
              minZoom={0.1}
              maxZoom={2}
              proOptions={proOptions}
            >
              <Background gap={16} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
        </div>

        <NodeDetailDrawer
          node={selectedNode}
          edges={graph.edges}
          allNodes={graph.nodes}
          childrenMap={childrenMap}
          onClose={() => setSelectedNode(null)}
          onNodeNavigate={handleNodeNavigate}
        />
      </div>

      {showTable && (
        <div className="h-72 border-t border-edge overflow-hidden flex flex-col">
          <NodeTable nodes={visibleTableNodes} allNodes={graph.nodes} onNodeClick={handleTableNodeClick} />
        </div>
      )}

      {pendingConnection && (
        <EdgeCreateDialog
          fromId={pendingConnection.fromId}
          toId={pendingConnection.toId}
          fromTitle={pendingFromTitle}
          toTitle={pendingToTitle}
          onCreated={handleEdgeCreated}
          onCancel={() => setPendingConnection(null)}
        />
      )}
    </div>
  )
}
