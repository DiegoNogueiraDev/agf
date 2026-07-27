/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { ReactElement } from 'react'
import { Box, Text } from 'ink'
import { tabNav, type ViewName } from '../tab-nav.js'

export interface ViewTabsProps {
  activeView: ViewName
  onSelect?: (view: ViewName) => void
}

const VIEW_COLORS: Record<ViewName, string> = {
  dashboard: 'blue',
  kanban: 'magenta',
  tree: 'green',
  health: 'cyan',
  economy: 'yellow',
}

export function ViewTabs({ activeView }: ViewTabsProps): ReactElement {
  return (
    <Box flexDirection="row" gap={0}>
      {(['dashboard', 'kanban', 'tree', 'health', 'economy'] as const).map((v) => {
        const isActive = v === activeView
        return (
          <Box key={v} marginRight={1}>
            <Text color={isActive ? VIEW_COLORS[v] : 'grey'} bold={isActive} inverse={isActive}>
              {tabNav.label(v)}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}
