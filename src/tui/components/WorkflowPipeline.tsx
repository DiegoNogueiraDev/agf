import type { ReactElement } from 'react'
import { Box, Text } from 'ink'

const PIPELINE = [
  { id: 'ANALYZE', label: 'ANALYZE', icon: '🔍' },
  { id: 'DESIGN', label: 'DESIGN', icon: '📐' },
  { id: 'PLAN', label: 'PLAN', icon: '📋' },
  { id: 'IMPLEMENT', label: 'IMPLEMENT', icon: '💻' },
  { id: 'VALIDATE', label: 'VALIDATE', icon: '✅' },
  { id: 'REVIEW', label: 'REVIEW', icon: '👁' },
  { id: 'HANDOFF', label: 'HANDOFF', icon: '📦' },
  { id: 'DEPLOY', label: 'DEPLOY', icon: '🚀' },
  { id: 'LISTENING', label: 'LISTENING', icon: '🎧' },
] as const

export interface WorkflowPipelineProps {
  currentPhase: string
  completedPhases?: Set<string>
  compact?: boolean
}

export function WorkflowPipeline({
  currentPhase,
  completedPhases = new Set(),
  compact,
}: WorkflowPipelineProps): ReactElement {
  const phases = PIPELINE

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        Pipeline
      </Text>
      <Box flexDirection="row" flexWrap="wrap">
        {phases.map((phase, i) => {
          const isCurrent = phase.id === currentPhase
          const isDone = completedPhases.has(phase.id)
          const statusColor = isDone ? 'green' : isCurrent ? 'yellow' : 'grey'
          const connector = i < phases.length - 1 ? ' → ' : ''

          if (compact) {
            return (
              <Box key={phase.id} flexDirection="row" alignItems="center">
                <Text color={statusColor} bold={isCurrent || isDone} inverse={isCurrent}>
                  {' '}
                  {phase.label}{' '}
                </Text>
                <Text color="grey" dimColor>
                  {connector}
                </Text>
              </Box>
            )
          }

          return (
            <Box key={phase.id} flexDirection="column" alignItems="center" marginRight={0}>
              <Box
                borderStyle="round"
                borderColor={isCurrent ? 'yellow' : isDone ? 'green' : 'grey'}
                paddingX={1}
                paddingY={0}
              >
                <Text color={statusColor} bold={isCurrent || isDone} dimColor={!isCurrent && !isDone}>
                  {phase.label}
                </Text>
              </Box>
              {connector ? (
                <Text color="grey" dimColor>
                  │
                </Text>
              ) : null}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

export interface PhaseGateMapProps {
  activePhase: string
}

const GATES: Record<string, string> = {
  ANALYZE: '≥1 requirement',
  DESIGN: 'design_ready',
  PLAN: 'sync_stack_docs',
  IMPLEMENT: 'WIP=1',
  VALIDATE: 'E2E tests pass',
  REVIEW: 'code review',
  HANDOFF: 'PR ready',
  DEPLOY: 'release ready',
  LISTENING: 'retro done',
}

export function PhaseGateMap({ activePhase }: PhaseGateMapProps): ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        Phase Gates
      </Text>
      {PIPELINE.map((phase) => {
        const isActive = phase.id === activePhase
        const gate = GATES[phase.id] ?? ''
        return (
          <Box key={phase.id} flexDirection="row">
            <Text color={isActive ? 'yellow' : 'grey'} bold={isActive}>
              {isActive ? '▸' : ' '}
            </Text>
            <Box width={12}>
              <Text color={isActive ? 'yellow' : 'grey'} bold={isActive}>
                {phase.label}
              </Text>
            </Box>
            <Text color="grey" dimColor>
              {' '}
              {gate}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}
