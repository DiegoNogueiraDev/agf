/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_dbc4b33ff480 — DiffView: colore as linhas produzidas por renderEditDiff
 * (`+` verde, `-` vermelho, header dim). Presentacional puro.
 */
import type { ReactElement } from 'react'
import { Box, Text } from 'ink'
import { renderPlanDiff, type EditLike } from './diff-render.js'

/** Cor para uma linha de diff conforme o prefixo. */
export function diffLineColor(line: string): 'green' | 'red' | undefined {
  if (line.startsWith('+ ')) return 'green'
  if (line.startsWith('- ')) return 'red'
  return undefined
}

export interface DiffViewProps {
  edits: EditLike[]
}

/** Render colorido do diff de um conjunto de edits. */
export function DiffView({ edits }: DiffViewProps): ReactElement | null {
  const lines = renderPlanDiff(edits)
  if (lines.length === 0) return null
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        const color = diffLineColor(line)
        return (
          <Text key={i} color={color} dimColor={color === undefined}>
            {line}
          </Text>
        )
      })}
    </Box>
  )
}
