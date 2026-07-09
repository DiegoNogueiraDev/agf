/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import type { NavGroup, TabId } from './nav-config'

export interface SidebarGroupProps {
  group: NavGroup
  activeTab: TabId
  collapsed: boolean
  onTabChange: (tab: TabId) => void
  defaultExpanded?: boolean
  touchFriendly?: boolean
}

export const SidebarGroup = memo(function SidebarGroup({
  group,
  activeTab,
  collapsed,
  onTabChange,
  defaultExpanded = false,
  touchFriendly = false,
}: SidebarGroupProps) {
  const hasActiveTab = group.items.some((item) => item.id === activeTab)
  const [expanded, setExpanded] = useState(hasActiveTab || defaultExpanded)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined)
  const panelId = `sidebar-group-${group.id}-panel`
  const headerId = `sidebar-group-${group.id}-header`

  // Auto-expand when active tab is in this group. Intentionally omits `expanded`
  // from deps — it is read only to skip a redundant setState, not to react to it.
  useEffect(() => {
    if (hasActiveTab && !expanded) {
      setExpanded(true)
    }
  }, [hasActiveTab])

  // Measure content height for animation
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [group.items.length])

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggleExpanded()
      }
    },
    [toggleExpanded],
  )

  const GroupIcon = group.icon

  // Collapsed sidebar: show only item icons, no group header
  if (collapsed) {
    return (
      <div className="py-1">
        {group.items.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
              className={`
                group relative flex items-center justify-center w-full p-2 rounded-lg text-sm
                transition-colors duration-200
                ${touchFriendly ? 'min-h-[44px]' : ''}
                ${isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-elevated hover:text-foreground'}
              `}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span
                className="
                absolute left-full ml-2 px-2 py-1 rounded-md text-xs font-medium
                bg-surface-elevated text-foreground border border-edge shadow-lg
                opacity-0 pointer-events-none group-hover:opacity-100
                transition-opacity duration-150 whitespace-nowrap z-50
              "
              >
                {item.label}
                {item.beta && ' (beta)'}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div role="group" aria-labelledby={headerId} className="py-1">
      {/* Group header */}
      <div
        id={headerId}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        className="
          flex items-center gap-2 px-3 py-1.5 w-full rounded-lg
          text-[11px] font-semibold uppercase tracking-wider
          text-muted/70 hover:text-muted
          cursor-pointer select-none transition-colors duration-150
        "
      >
        <ChevronRight
          className={`
            w-3 h-3 transition-transform duration-200
            ${expanded ? 'rotate-90' : ''}
          `}
        />
        <GroupIcon className="w-3.5 h-3.5" />
        <span>{group.label}</span>
      </div>

      {/* Group items — animated expand/collapse */}
      <div
        id={panelId}
        ref={contentRef}
        role="region"
        aria-label={`${group.label} navigation items`}
        style={{
          maxHeight: expanded ? (contentHeight ?? 1000) : 0,
          opacity: expanded ? 1 : 0,
        }}
        className="overflow-hidden transition-all duration-200 ease-out"
      >
        {group.items.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`
                flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium
                transition-colors duration-200
                ${touchFriendly ? 'min-h-[44px]' : ''}
                ${isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-elevated hover:text-foreground'}
              `}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.beta && (
                <span className="ml-auto text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-warning/15 text-warning">
                  beta
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
})
