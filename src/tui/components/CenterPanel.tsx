/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * CenterPanel — the view-switch body of InteractiveApp's center pane (kanban /
 * tree / health / economy / default dashboard). Extracted from
 * interactive-app.tsx's `renderCenterPanel` (interactive-app.tsx was >800 lines).
 */
import type { ReactElement } from 'react'
import { Box, Text } from 'ink'
import { App } from '../app.js'
import { KanbanBoard, type KanbanNode, type SwimlaneMode } from './KanbanBoard.js'
import { GraphTree } from './GraphTree.js'
import { HarnessWidget } from './HarnessWidget.js'
import { PhaseIndicator } from './PhaseIndicator.js'
import { TokenBudget } from './TokenBudget.js'
import { PluginHealth } from './PluginHealth.js'
import type { ViewName } from '../tab-nav.js'
import type { DashboardModel } from '../model.js'
import type { CollaborationMode } from '../../core/agent-driver/collaboration-mode.js'
import type { PluginRegistry } from '../../core/plugins/plugin-registry.js'
import type { SlashCommand } from '../dispatch.js'

interface GraphTreeNode {
  id: string
  title: string
  type: string
  status: string
  children?: GraphTreeNode[]
}

interface HarnessScore {
  testScore: number
  logScore: number
  totalModules: number
  darkModules: string[]
}

export interface CenterPanelProps {
  view: ViewName
  kanbanNodes: KanbanNode[]
  kanbanSwimlane: SwimlaneMode | undefined
  selectedNodeId: string | undefined
  kanbanFilter: string
  kanbanSort: 'title' | undefined
  kanbanSortDir: 'asc' | 'desc'
  graphTreeNodes: GraphTreeNode[]
  collapsedNodes: Set<string>
  toggleCollapse: (id: string) => void
  flatVisibleIds: string[]
  onSelectNode: (id: string, cursor: number) => void
  harnessScore: HarnessScore
  dashboard: DashboardModel
  collabMode: CollaborationMode
  pluginRegistry?: PluginRegistry
  skillCommands: SlashCommand[]
}

/** Renders the active center-pane view (kanban/tree/health/economy/dashboard). */
export function CenterPanel({
  view,
  kanbanNodes,
  kanbanSwimlane,
  selectedNodeId,
  kanbanFilter,
  kanbanSort,
  kanbanSortDir,
  graphTreeNodes,
  collapsedNodes,
  toggleCollapse,
  flatVisibleIds,
  onSelectNode,
  harnessScore,
  dashboard,
  collabMode,
  pluginRegistry,
  skillCommands,
}: CenterPanelProps): ReactElement {
  switch (view) {
    case 'kanban':
      return (
        <KanbanBoard
          nodes={kanbanNodes}
          swimlane={kanbanSwimlane}
          selectedId={selectedNodeId}
          wipLimits={{ in_progress: 3, ready: 10 }}
          filterText={kanbanFilter || undefined}
          sortBy={kanbanSort || undefined}
          sortDir={kanbanSortDir || undefined}
        />
      )
    case 'tree':
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text bold color="cyan">
            Graph Tree
          </Text>
          <GraphTree
            nodes={graphTreeNodes}
            selectedId={selectedNodeId ?? undefined}
            collapsed={collapsedNodes}
            onToggle={toggleCollapse}
            onSelect={(id) => {
              const idx = flatVisibleIds.indexOf(id)
              onSelectNode(id, idx)
            }}
          />
        </Box>
      )
    case 'health':
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text bold color="green">
            Saúde do Projeto
          </Text>
          <HarnessWidget
            score={(harnessScore.testScore + harnessScore.logScore) / 2}
            testScore={harnessScore.testScore}
            logScore={harnessScore.logScore}
            totalModules={harnessScore.totalModules}
            darkModules={harnessScore.darkModules}
          />
          <Box marginTop={1}>
            <PhaseIndicator current={dashboard.phase} />
          </Box>
          <Box marginTop={1}>
            <Text bold>Modelo:</Text>
            <Text> {dashboard.modelLabel}</Text>
          </Box>
        </Box>
      )
    case 'economy':
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text bold color="yellow">
            Economia de Tokens
          </Text>
          <TokenBudget budgetUsd={2.5} usedUsd={dashboard.tokens.costUsd} tokensUsed={dashboard.tokens.total} />
          <Box marginTop={1}>
            <Text bold>Total de chamadas:</Text>
            <Text> {dashboard.tokens.calls}</Text>
          </Box>
          <Box marginTop={1}>
            <Text bold>Tokens in/out:</Text>
            <Text>
              {' '}
              {dashboard.tokens.tokensIn} / {dashboard.tokens.tokensOut}
            </Text>
          </Box>
        </Box>
      )
    default:
      return (
        <Box flexDirection="column">
          <App model={dashboard} />
          <Box paddingX={1}>
            <Text dimColor>
              modo:{' '}
              <Text color={collabMode === 'plan' ? 'yellow' : collabMode === 'pair' ? 'magenta' : 'green'}>
                {collabMode.toUpperCase()}
              </Text>
            </Text>
          </Box>
          <PhaseIndicator current={dashboard.phase} />
          <HarnessWidget
            score={(harnessScore.testScore + harnessScore.logScore) / 2}
            testScore={harnessScore.testScore}
            logScore={harnessScore.logScore}
            totalModules={harnessScore.totalModules}
            darkModules={harnessScore.darkModules}
          />
          <TokenBudget budgetUsd={2.5} usedUsd={dashboard.tokens.costUsd} tokensUsed={dashboard.tokens.total} />
          <PluginHealth
            plugins={
              pluginRegistry
                ? pluginRegistry.list().map((p) => ({
                    name: p.manifest.name,
                    state:
                      p.status === 'enabled'
                        ? ('healthy' as const)
                        : p.status === 'error'
                          ? ('failed' as const)
                          : ('stopped' as const),
                  }))
                : skillCommands.map((s) => ({ name: s.name, state: 'healthy' as const }))
            }
          />
        </Box>
      )
  }
}
