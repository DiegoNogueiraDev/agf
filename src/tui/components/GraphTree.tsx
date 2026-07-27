import type { ReactElement } from 'react'
import { Box, Text } from 'ink'

const STATUS_PILL: Record<string, { icon: string; color: string }> = {
  backlog: { icon: '·', color: 'grey' },
  ready: { icon: '○', color: 'cyan' },
  in_progress: { icon: '◐', color: 'yellow' },
  blocked: { icon: '⨂', color: 'red' },
  done: { icon: '●', color: 'green' },
}

interface TreeNode {
  id: string
  title: string
  type: string
  status: string
  children?: TreeNode[]
}

export interface GraphTreeProps {
  nodes: TreeNode[]
  depth?: number
  selectedId?: string
  onSelect?: (id: string) => void
  collapsed?: Set<string>
  onToggle?: (id: string) => void
}

function TreeItem({
  node,
  depth,
  isSelected,
  isCollapsed,
  onToggle,
}: {
  node: TreeNode
  depth: number
  isSelected: boolean
  isCollapsed: boolean
  onToggle?: (id: string) => void
}): ReactElement {
  const pill = STATUS_PILL[node.status] ?? { icon: '·', color: 'grey' }
  const hasChildren = node.children && node.children.length > 0
  const indent = '  '.repeat(depth)
  const toggleIcon = hasChildren ? (isCollapsed ? '▶' : '▼') : ' '

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="grey">{indent}</Text>
        <Text color={isSelected ? 'cyan' : 'grey'} bold={isSelected} dimColor={!isSelected}>
          {toggleIcon}{' '}
        </Text>
        <Text color={pill.color}>{pill.icon}</Text>
        <Text color="grey"> </Text>
        <Text color={node.type === 'epic' ? 'yellow' : node.type === 'task' ? 'white' : 'grey'}>{node.title}</Text>
        <Text color="grey" dimColor>
          {' '}
          {node.id.slice(-6)}
        </Text>
      </Box>
      {hasChildren && !isCollapsed && (
        <Box flexDirection="column">
          {node.children!.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              isSelected={false}
              isCollapsed={false}
              onToggle={onToggle}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

export function GraphTree({
  nodes,
  depth = 0,
  selectedId,
  collapsed = new Set(),
  onToggle,
}: GraphTreeProps): ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      {nodes.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          depth={depth}
          isSelected={node.id === selectedId}
          isCollapsed={collapsed.has(node.id)}
          onToggle={onToggle}
        />
      ))}
      {nodes.length === 0 && (
        <Text color="grey" dimColor>
          (empty)
        </Text>
      )}
    </Box>
  )
}
