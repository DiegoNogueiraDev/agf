/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SkillProgress — barra de progresso para execucao de skills.
 */
import type { ReactElement } from 'react'
import { Box, Text } from 'ink'

export interface SkillProgressProps {
  total: number
  completed: number
  label: string
  elapsedSecs: number
  tokensUsed: number
}

export function SkillProgress({ total, completed, label, elapsedSecs, tokensUsed }: SkillProgressProps): ReactElement {
  const pct = Math.round((completed / total) * 100)

  return (
    <Box flexDirection="row" borderStyle="single" paddingX={1} marginTop={1}>
      <Text color="yellow">
        [{completed}/{total}]
      </Text>
      <Text> {label} </Text>
      <Text dimColor>
        {elapsedSecs}s · {tokensUsed} tok
      </Text>
      <Text color="cyan"> {pct}%</Text>
    </Box>
  )
}
