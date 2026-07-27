/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * FilterPanel — the collapsible filter drawer for the graph (opened from the
 * toolbar). Trimmed to the useful selectors only: Status, the node Types that
 * actually exist in this graph (with counts), Sprint (scrollable, present-only),
 * and layout direction. Expand/Collapse/Clear/count live in the toolbar — not
 * duplicated here.
 */

import { memo } from 'react'
import type { NodeStatus, NodeType } from '@/lib/types'
import { ALL_STATUSES, STATUS_COLORS, NODE_TYPE_COLORS } from '@/lib/constants'

interface FilterPanelProps {
  statuses: Set<string>
  types: Set<string>
  sprints?: Set<string>
  /** Node types actually present in the graph (with counts), present-sorted. */
  availableTypes: Array<{ type: NodeType; count: number }>
  availableSprints?: string[]
  direction: 'TB' | 'LR'
  onStatusToggle: (status: NodeStatus) => void
  onTypeToggle: (type: NodeType) => void
  onSprintToggle?: (sprint: string) => void
  onDirectionChange: (dir: 'TB' | 'LR') => void
}

export const FilterPanel = memo(function FilterPanel({
  statuses,
  types,
  sprints,
  availableTypes,
  availableSprints,
  direction,
  onStatusToggle,
  onTypeToggle,
  onSprintToggle,
  onDirectionChange,
}: FilterPanelProps) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3 border-b border-edge bg-surface-alt text-xs">
      {/* Status */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-14 shrink-0 font-medium text-muted">Status</span>
        {ALL_STATUSES.map((s) => {
          const active = statuses.has(s)
          return (
            <button
              key={s}
              onClick={() => onStatusToggle(s)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border transition-colors ${
                active
                  ? 'border-accent/50 bg-accent/15 text-foreground'
                  : 'border-edge text-muted hover:bg-surface-elevated'
              }`}
            >
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: STATUS_COLORS[s] }} />
              {s.replace('_', ' ')}
            </button>
          )
        })}
      </div>

      {/* Type — only types present in the graph, with counts */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-14 shrink-0 font-medium text-muted">Type</span>
        {availableTypes.length === 0 ? (
          <span className="text-muted">none</span>
        ) : (
          availableTypes.map(({ type, count }) => {
            const active = types.has(type)
            return (
              <button
                key={type}
                onClick={() => onTypeToggle(type)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border transition-colors ${
                  active
                    ? 'border-accent/50 bg-accent/15 text-foreground'
                    : 'border-edge text-muted hover:bg-surface-elevated'
                }`}
              >
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: NODE_TYPE_COLORS[type] }} />
                {type.replace('_', ' ')}
                <span className="text-[10px] opacity-70 tabular-nums">{count}</span>
              </button>
            )
          })
        )}
      </div>

      {/* Sprint — scrollable, present-only */}
      {availableSprints && availableSprints.length > 0 && onSprintToggle && (
        <div className="flex items-start gap-2">
          <span className="w-14 shrink-0 font-medium text-muted pt-1">Sprint</span>
          <div className="flex flex-wrap items-center gap-1.5 max-h-20 overflow-y-auto pr-1">
            {availableSprints.map((s) => {
              const active = sprints?.has(s) ?? false
              return (
                <button
                  key={s}
                  onClick={() => onSprintToggle(s)}
                  aria-pressed={active}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${
                    active
                      ? 'border-accent/50 bg-accent/15 text-foreground'
                      : 'border-edge text-muted hover:bg-surface-elevated'
                  }`}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Direction */}
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 font-medium text-muted">Layout</span>
        <select
          value={direction}
          onChange={(e) => onDirectionChange(e.target.value as 'TB' | 'LR')}
          className="bg-surface border border-edge rounded px-1.5 py-1 text-xs"
        >
          <option value="TB">Top → Down</option>
          <option value="LR">Left → Right</option>
        </select>
      </div>
    </div>
  )
})
