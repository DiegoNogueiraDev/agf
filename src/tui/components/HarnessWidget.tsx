/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * HarnessWidget — exibe score de qualidade do projeto (testes + logs)
 * com grade A/B/C/D e breakdown de métricas.
 */
import type { ReactElement } from 'react'
import { Box, Text } from 'ink'

export interface HarnessWidgetProps {
  score: number
  testScore: number
  logScore: number
  totalModules: number
  darkModules: string[]
}

function grade(score: number): { label: string; color: string } {
  if (score >= 85) return { label: 'A', color: 'green' }
  if (score >= 70) return { label: 'B', color: 'yellow' }
  if (score >= 55) return { label: 'C', color: 'yellow' }
  return { label: 'D', color: 'red' }
}

function healthColor(value: number): string {
  if (value >= 80) return 'green'
  if (value >= 50) return 'yellow'
  return 'red'
}

function bar(value: number, width: number = 8): string {
  const filled = Math.round((value / 100) * width)
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)
}

export function HarnessWidget({
  score,
  testScore,
  logScore,
  totalModules,
  darkModules,
}: HarnessWidgetProps): ReactElement {
  const g = grade(score)

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>
        Harness:{' '}
        <Text color={g.color}>
          {score}/100 [{g.label}]
        </Text>
        <Text dimColor> ({totalModules} modulos)</Text>
      </Text>
      <Text>
        <Text color="green">Tests</Text> <Text color={healthColor(testScore)}>{bar(testScore)}</Text> {testScore}%
      </Text>
      <Text>
        <Text color="blue">Logs</Text> <Text color={healthColor(logScore)}>{bar(logScore)}</Text> {logScore}%
      </Text>
      {darkModules.length > 0 && (
        <Text color="red" dimColor>
          {darkModules.length} modulos sem cobertura
        </Text>
      )}
    </Box>
  )
}
