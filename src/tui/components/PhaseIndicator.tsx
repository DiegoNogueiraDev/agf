/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * PhaseIndicator — barra horizontal mostrando as 9 fases do lifecycle
 * com destaque para a fase atual.
 */
import type { ReactElement } from 'react'
import { Box, Text } from 'ink'

const PHASES = ['ANALYZE', 'DESIGN', 'PLAN', 'IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING']

const CANONICAL_MAP: Record<string, string[]> = {
  SHAPE: ['ANALYZE', 'DESIGN', 'PLAN'],
  BUILD: ['IMPLEMENT', 'VALIDATE'],
  SHIP: ['REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING'],
}

export interface PhaseIndicatorProps {
  current: string
}

export function PhaseIndicator({ current }: PhaseIndicatorProps): ReactElement {
  const mapped = CANONICAL_MAP[current] ?? [current]

  return (
    <Box flexDirection="row" borderStyle="single" paddingX={1}>
      <Text bold>Fase: </Text>
      {PHASES.map((phase, i) => {
        const isCurrent = mapped.includes(phase)
        return (
          <Text key={phase}>
            {i > 0 && <Text dimColor> → </Text>}
            <Text color={isCurrent ? 'yellow' : undefined} dimColor={!isCurrent}>
              {phase}
            </Text>
          </Text>
        )
      })}
    </Box>
  )
}
