/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Breadcrumb — renders `Group > Tab > [context]` in the slim header. The group
 * label is derived from NAV_GROUPS (nav-config), so it stays correct as tabs
 * change. Each segment is clickable.
 */

import { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import type { TabId } from './nav-config'
import { NAV_GROUPS } from './nav-config'

export interface BreadcrumbProps {
  activeTab: TabId
  tabLabel: string
  onTabChange: (tab: TabId) => void
  context?: string
}

/** Find the nav group + its first tab for the active tab (falls back to the first group). */
function groupForTab(activeTab: TabId): { label: string; defaultTab: TabId } {
  const group = NAV_GROUPS.find((g) => g.items.some((i) => i.id === activeTab)) ?? NAV_GROUPS[0]
  return { label: group.label, defaultTab: group.items[0].id }
}

export const Breadcrumb = memo(function Breadcrumb({
  activeTab,
  tabLabel,
  onTabChange,
  context,
}: BreadcrumbProps): React.JSX.Element {
  const { label: areaLabel, defaultTab } = groupForTab(activeTab)
  const showTabSegment = areaLabel !== tabLabel

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1">
        <li>
          <button
            onClick={() => onTabChange(defaultTab)}
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            {areaLabel}
          </button>
        </li>
        {showTabSegment && (
          <>
            <li aria-hidden="true">
              <ChevronRight className="w-3.5 h-3.5 text-muted" />
            </li>
            <li>
              <button
                onClick={() => onTabChange(activeTab)}
                className="text-sm font-semibold text-foreground"
                aria-current="page"
              >
                {tabLabel}
              </button>
            </li>
          </>
        )}
        {context && (
          <>
            <li aria-hidden="true">
              <ChevronRight className="w-3.5 h-3.5 text-muted" />
            </li>
            <li>
              <span className="text-xs text-muted">{context}</span>
            </li>
          </>
        )}
      </ol>
    </nav>
  )
})
