import type { ReactElement } from 'react'
import { Box, Text } from 'ink'

const PHASES = [
  { id: 'ANALYZE', label: 'ANALYZE', color: 'blue' },
  { id: 'DESIGN', label: 'DESIGN', color: 'magenta' },
  { id: 'PLAN', label: 'PLAN', color: 'yellow' },
  { id: 'IMPLEMENT', label: 'IMPLEMENT', color: 'green' },
  { id: 'VALIDATE', label: 'VALIDATE', color: 'cyan' },
  { id: 'REVIEW', label: 'REVIEW', color: 'magenta' },
  { id: 'HANDOFF', label: 'HANDOFF', color: 'yellow' },
  { id: 'DEPLOY', label: 'DEPLOY', color: 'red' },
  { id: 'LISTENING', label: 'LISTENING', color: 'blue' },
] as const

export interface PhaseTabsProps {
  activePhase: string
  onSelect?: (phase: string) => void
}

export function PhaseTabs({ activePhase }: PhaseTabsProps): ReactElement {
  return (
    <Box flexDirection="row" gap={0}>
      {PHASES.map((phase) => {
        const isActive = phase.id === activePhase
        return (
          <Box key={phase.id} marginRight={0}>
            <Text color={isActive ? phase.color : 'grey'} bold={isActive} inverse={isActive}>
              {isActive ? ` ${phase.label} ` : ` ${phase.label} `}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}
