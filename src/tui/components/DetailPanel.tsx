import type { ReactElement } from 'react'
import { Box, Text } from 'ink'

const STATUS_PILL: Record<string, { icon: string; color: string }> = {
  backlog: { icon: '·', color: 'grey' },
  ready: { icon: '○', color: 'cyan' },
  in_progress: { icon: '◐', color: 'yellow' },
  blocked: { icon: '⨂', color: 'red' },
  done: { icon: '●', color: 'green' },
}

export interface DetailNode {
  id: string
  title: string
  type: string
  status: string
  priority: number
  xpSize?: string
  tags?: string[]
  description?: string
  acceptanceCriteria?: string[]
  testFiles?: string[]
  parentTitle?: string
  children: string[]
  blockers: string[]
  createdAt?: string
  updatedAt?: string
  weight?: number
  accessCount?: number
}

export interface DetailPanelProps {
  node?: DetailNode | null
}

function Pill({ label, color }: { label: string; color?: string }): ReactElement {
  return (
    <Box marginRight={1}>
      <Text color={color || 'grey'} dimColor>
        [{label}]
      </Text>
    </Box>
  )
}

export function DetailPanel({ node }: DetailPanelProps): ReactElement {
  if (!node) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="grey" dimColor>
          Select a node to view details
        </Text>
      </Box>
    )
  }

  const pill = STATUS_PILL[node.status] ?? { icon: '·', color: 'grey' }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Box borderStyle="single" paddingX={1} flexDirection="column">
        <Text bold color="cyan">
          {pill.icon} {node.title}
        </Text>
        <Text color="grey" dimColor>
          {node.id}
        </Text>

        <Box marginTop={1} flexDirection="row">
          <Pill label={node.type} color="magenta" />
          <Pill label={`P${node.priority}`} color="yellow" />
          {node.xpSize && <Pill label={node.xpSize} color="green" />}
          {node.parentTitle && <Pill label={`parent: ${node.parentTitle}`} color="blue" />}
        </Box>

        {node.tags && node.tags.length > 0 && (
          <Box marginTop={0}>
            {node.tags.map((t) => (
              <Pill key={t} label={t} color="grey" />
            ))}
          </Box>
        )}

        {node.description && (
          <Box marginTop={1}>
            <Text dimColor>{node.description}</Text>
          </Box>
        )}

        {node.children && node.children.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color="cyan">
              Subtasks ({node.children.length})
            </Text>
            {node.children.map((c) => (
              <Text key={c} dimColor>
                {'  '}◦ {c}
              </Text>
            ))}
          </Box>
        )}

        {node.blockers && node.blockers.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color="red">
              Blockers
            </Text>
            {node.blockers.map((b) => (
              <Text key={b} color="red" dimColor>
                {'  '}⨂ {b}
              </Text>
            ))}
          </Box>
        )}

        {node.acceptanceCriteria && node.acceptanceCriteria.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">
              Acceptance Criteria
            </Text>
            {node.acceptanceCriteria.map((ac, i) => (
              <Text key={i} dimColor>
                {'  '}☐ {ac}
              </Text>
            ))}
          </Box>
        )}

        {node.testFiles && node.testFiles.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color="green">
              Test Files
            </Text>
            {node.testFiles.map((f, i) => (
              <Text key={i} color="green" dimColor>
                {'  '}✓ {f}
              </Text>
            ))}
          </Box>
        )}

        {(node.createdAt || node.weight !== undefined || node.accessCount !== undefined) && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color="grey">
              Metadata
            </Text>
            {node.createdAt && (
              <Text dimColor>
                {'  '}Created: {node.createdAt}
              </Text>
            )}
            {node.updatedAt && (
              <Text dimColor>
                {'  '}Updated: {node.updatedAt}
              </Text>
            )}
            {node.weight !== undefined && (
              <Text dimColor>
                {'  '}Weight: {node.weight}
              </Text>
            )}
            {node.accessCount !== undefined && (
              <Text dimColor>
                {'  '}Access: {node.accessCount}
              </Text>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}
