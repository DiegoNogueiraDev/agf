/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * KanbanBoard — renderiza 5 colunas (Backlog, Ready, In Progress, Blocked, Done)
 * com swimlanes opcionais por epic/sprint e indicadores de WIP limit.
 * Componente presentacional Ink puro.
 */
import type { ReactElement } from 'react'
import { Box, Text } from 'ink'

export interface KanbanNode {
  id: string
  type: string
  title: string
  status: string
  parentId?: string | null
  sprint?: string | null
}

export type SwimlaneMode = 'epic' | 'sprint'

export interface KanbanBoardProps {
  nodes: KanbanNode[]
  /** Agrupar cards por "epic" ou "sprint". Undefined = sem agrupamento. */
  swimlane?: SwimlaneMode
  /** Limites WIP por coluna. Ex: { in_progress: 3, ready: 10 }. */
  wipLimits?: Partial<Record<string, number>>
  /** Card atualmente selecionado (vim navigation). */
  selectedId?: string
  /** Filtro por texto (case-insensitive) no título. */
  filterText?: string
  /** Ordenação por campo. */
  sortBy?: 'title'
  /** Direção da ordenação. */
  sortDir?: 'asc' | 'desc'
}

const COLUMNS = ['backlog', 'ready', 'in_progress', 'blocked', 'done'] as const

const COLUMN_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}

const STATUS_ICON: Record<string, string> = {
  backlog: '\u00b7',
  ready: '\u25cb',
  in_progress: '\u25cf',
  blocked: '\u25b2',
  done: '\u2713',
}

const COLUMN_COLORS: Record<string, string> = {
  backlog: 'gray',
  ready: 'yellow',
  in_progress: 'blue',
  blocked: 'red',
  done: 'green',
}

function groupBySwimlane(
  taskNodes: KanbanNode[],
  allNodes: KanbanNode[],
  swimlane?: SwimlaneMode,
): Map<string, KanbanNode[]> {
  const groups = new Map<string, KanbanNode[]>()
  if (!swimlane) {
    groups.set('', taskNodes)
    return groups
  }
  for (const node of taskNodes) {
    let key = swimlane === 'epic' ? (node.parentId ?? '(sem epic)') : (node.sprint ?? '(sem sprint)')

    if (swimlane === 'epic' && node.parentId) {
      const parent = allNodes.find((n) => n.id === node.parentId)
      if (parent) key = parent.title
    }

    const group = groups.get(key) ?? []
    group.push(node)
    groups.set(key, group)
  }
  return groups
}

function Column({
  status,
  cards,
  wipLimit,
  selectedId,
}: {
  status: string
  cards: KanbanNode[]
  wipLimit?: number
  selectedId?: string
}): ReactElement {
  const color = COLUMN_COLORS[status] ?? 'white'
  const count = cards.length
  const overWip = wipLimit !== undefined && count > wipLimit
  const countText = overWip ? `${count}/${wipLimit}` : `(${count})`

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1} marginRight={1} flexGrow={1}>
      <Text bold color={color}>
        {COLUMN_LABELS[status] ?? status}{' '}
        {overWip ? <Text color="red">{countText}</Text> : <Text dimColor>{countText}</Text>}
      </Text>
      {cards.slice(0, 10).map((card) => (
        <Text
          key={card.id}
          color={card.id === selectedId ? 'cyan' : undefined}
          bold={card.id === selectedId}
          dimColor={card.status === 'done' && card.id !== selectedId}
        >
          {card.id === selectedId ? '\u276f ' : ''}
          {STATUS_ICON[card.status] ?? '\u00b7'} {card.title.length > 30 ? card.title.slice(0, 27) + '...' : card.title}
        </Text>
      ))}
      {cards.length > 10 && <Text dimColor> ... +{cards.length - 10} mais</Text>}
    </Box>
  )
}

function SwimlaneHeader({ label, nodeCount }: { label: string; nodeCount: number }): ReactElement {
  return (
    <Box marginTop={1}>
      <Text bold color="magenta">
        {label} ({nodeCount})
      </Text>
    </Box>
  )
}

/** Componente Kanban presentacional. Recebe nodes, renderiza 5 colunas. */
export function KanbanBoard({
  nodes,
  swimlane,
  wipLimits,
  selectedId,
  filterText,
  sortBy,
  sortDir,
}: KanbanBoardProps): ReactElement {
  let taskNodes = nodes.filter((n) => n.type === 'task' || n.type === 'subtask')
  if (filterText) {
    const lowered = filterText.toLowerCase()
    taskNodes = taskNodes.filter((n) => n.title.toLowerCase().includes(lowered))
  }
  if (sortBy === 'title') {
    taskNodes = [...taskNodes].sort((a, b) => {
      const cmp = a.title.localeCompare(b.title)
      return sortDir === 'desc' ? -cmp : cmp
    })
  }

  if (taskNodes.length === 0) {
    return (
      <Box borderStyle="round" paddingX={1}>
        <Text dimColor>Nenhuma task no grafo.</Text>
      </Box>
    )
  }

  const groups = groupBySwimlane(taskNodes, nodes, swimlane)

  return (
    <Box flexDirection="column">
      {groups.size <= 1 && !swimlane ? (
        <Box flexDirection="row">
          {COLUMNS.map((status) => (
            <Column
              key={status}
              status={status}
              cards={taskNodes.filter((n) => n.status === status)}
              wipLimit={wipLimits?.[status]}
              selectedId={selectedId}
            />
          ))}
        </Box>
      ) : (
        <Box flexDirection="column">
          {Array.from(groups.entries()).map(([label, groupNodes]) => (
            <Box key={label} flexDirection="column">
              <SwimlaneHeader label={label} nodeCount={groupNodes.length} />
              <Box flexDirection="row">
                {COLUMNS.map((status) => (
                  <Column
                    key={status}
                    status={status}
                    cards={groupNodes.filter((n) => n.status === status)}
                    wipLimit={wipLimits?.[status]}
                    selectedId={selectedId}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
