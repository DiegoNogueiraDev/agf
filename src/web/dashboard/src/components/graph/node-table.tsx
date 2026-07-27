/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { memo, useState, useMemo, useDeferredValue, useCallback } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { GraphNode } from '@/lib/types'
import { STATUS_COLORS, NODE_TYPE_COLORS } from '@/lib/constants'
import { parseFacetedSearch, applyFacetedFilter } from '@/lib/faceted-search'

interface NodeTableProps {
  nodes: GraphNode[]
  allNodes?: GraphNode[]
  onNodeClick: (node: GraphNode) => void
}

type SortKey = 'title' | 'type' | 'status' | 'priority' | 'xpSize' | 'sprint' | 'parentId'

const PAGE_SIZE = 50
const COLUMN_STORAGE_KEY = 'mcp-graph-table-columns'
const ALL_COLUMNS: Array<{ key: SortKey; label: string; width: string }> = [
  { key: 'title', label: 'Title', width: '40%' },
  { key: 'type', label: 'Type', width: '10%' },
  { key: 'status', label: 'Status', width: '10%' },
  { key: 'priority', label: 'Priority', width: '8%' },
  { key: 'xpSize', label: 'Size', width: '7%' },
  { key: 'sprint', label: 'Sprint', width: '12%' },
  { key: 'parentId', label: 'Parent', width: '13%' },
]
const DEFAULT_VISIBLE: SortKey[] = ['title', 'type', 'status', 'priority', 'xpSize']

function loadColumnPrefs(): Set<SortKey> {
  try {
    const stored = localStorage.getItem(COLUMN_STORAGE_KEY)
    if (stored) return new Set(JSON.parse(stored) as SortKey[])
  } catch {
    /* noop */
  }
  return new Set(DEFAULT_VISIBLE)
}

function saveColumnPrefs(cols: Set<SortKey>): void {
  try {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify([...cols]))
  } catch {
    /* noop */
  }
}

export const NodeTable = memo(function NodeTable({ nodes, allNodes = [], onNodeClick }: NodeTableProps) {
  const parentMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const n of allNodes) map.set(n.id, n.title)
    return map
  }, [allNodes])
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [page, setPage] = useState(0)
  const [visibleCols, setVisibleCols] = useState<Set<SortKey>>(loadColumnPrefs)
  const [colMenuOpen, setColMenuOpen] = useState(false)

  const toggleColumn = useCallback((key: SortKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key) // keep at least 1
      } else {
        next.add(key)
      }
      saveColumnPrefs(next)
      return next
    })
  }, [])

  const filtered = useMemo(() => {
    if (!deferredSearch) return nodes
    const query = parseFacetedSearch(deferredSearch)
    return applyFacetedFilter(nodes, query)
  }, [nodes, deferredSearch])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = a[sortKey] ?? ''
      const vb = b[sortKey] ?? ''
      const cmp = typeof va === 'number' ? (va as number) - (vb as number) : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paged = useMemo(() => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sorted, page])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const headers = useMemo(() => ALL_COLUMNS.filter((c) => visibleCols.has(c.key)), [visibleCols])

  return (
    <div className="border-t border-edge">
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-alt">
        <input
          type="text"
          placeholder="Search... (status:done type:task sprint:v9.2)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-xs px-2 py-1 text-sm border border-edge rounded bg-surface"
        />
        {/* Column toggle dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setColMenuOpen((p) => !p)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-edge rounded hover:bg-surface-elevated transition-colors cursor-pointer"
            title="Toggle columns"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Columns</span>
          </button>
          {colMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-surface-alt border border-edge rounded-lg shadow-lg py-1">
                {ALL_COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-elevated cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="rounded border-edge"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto max-h-64">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="bg-surface-elevated">
              {headers.map((h) => (
                <th
                  key={h.key}
                  onClick={() => handleSort(h.key)}
                  className="px-3 py-1.5 text-left text-xs font-medium text-muted cursor-pointer hover:text-foreground"
                  style={{ width: h.width }}
                >
                  {h.label}
                  {sortKey === h.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-3 py-4 text-center text-muted">
                  No nodes found
                </td>
              </tr>
            ) : (
              paged.map((node) => (
                <tr
                  key={node.id}
                  onClick={() => onNodeClick(node)}
                  className="border-t border-edge hover:bg-surface-alt cursor-pointer"
                >
                  {visibleCols.has('title') && <td className="px-3 py-2.5 truncate">{node.title}</td>}
                  {visibleCols.has('type') && (
                    <td className="px-3 py-2.5">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{ background: `${NODE_TYPE_COLORS[node.type]}20`, color: NODE_TYPE_COLORS[node.type] }}
                      >
                        {node.type}
                      </span>
                    </td>
                  )}
                  {visibleCols.has('status') && (
                    <td className="px-3 py-2.5">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: `${STATUS_COLORS[node.status]}20`, color: STATUS_COLORS[node.status] }}
                      >
                        {node.status.replace('_', ' ')}
                      </span>
                    </td>
                  )}
                  {visibleCols.has('priority') && <td className="px-3 py-2.5 text-center">{node.priority}</td>}
                  {visibleCols.has('xpSize') && <td className="px-3 py-2.5 text-center">{node.xpSize || '-'}</td>}
                  {visibleCols.has('sprint') && <td className="px-3 py-2.5">{node.sprint || '-'}</td>}
                  {visibleCols.has('parentId') && (
                    <td className="px-3 py-2.5 truncate text-muted">
                      {node.parentId ? (parentMap.get(node.parentId) ?? '-') : '-'}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-surface-alt border-t border-edge text-xs text-muted">
          <span>{sorted.length} nodes</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-2 py-0.5 rounded border border-edge disabled:opacity-30"
            >
              Prev
            </button>
            <span>
              {page + 1}/{totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="px-2 py-0.5 rounded border border-edge disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
